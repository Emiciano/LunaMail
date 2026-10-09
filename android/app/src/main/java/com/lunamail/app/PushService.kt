package com.lunamail.app

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.lunamail.app.data.Account
import com.lunamail.app.data.AccountStore
import com.lunamail.app.data.MailClient
import com.lunamail.app.ui.MailViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withTimeoutOrNull

/** Meldungen innerhalb der App, z. B. damit eine offene Liste neue E-Mails sofort zeigt. */
object MailEvents {
    /** Konto-ID, in dessen Eingang neue E-Mails angekommen sind. */
    val inboxChanged = MutableSharedFlow<String>(extraBufferCapacity = 8)
}

/**
 * Hält zu jedem Konto eine Verbindung zum Eingang offen (IMAP IDLE), damit neue E-Mails sofort
 * gemeldet werden, auch wenn die App geschlossen ist. Android verlangt dafür eine dauerhafte,
 * leise Mitteilung. Beherrscht ein Server kein IDLE, fragt der Dienst alle paar Minuten nach.
 */
class PushService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val watchers = mutableMapOf<String, Watcher>()
    private val kick = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    private class Watcher(val account: Account, val client: MailClient, val job: Job)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        if (!startInForeground()) return
        val connectivity = getSystemService(ConnectivityManager::class.java)
        val callback = object : ConnectivityManager.NetworkCallback() {
            // Nach einem Funkloch sofort neu verbinden, statt die Wartezeit abzusitzen.
            override fun onAvailable(network: Network) {
                kick.tryEmit(Unit)
            }
        }
        runCatching { connectivity.registerDefaultNetworkCallback(callback) }.onSuccess { networkCallback = callback }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!startInForeground()) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (intent?.action == ACTION_PING) {
            ping()
        } else {
            reload()
        }
        scheduleKeepAlive()
        return START_STICKY
    }

    override fun onDestroy() {
        networkCallback?.let { runCatching { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it) } }
        cancelKeepAlive()
        synchronized(watchers) {
            watchers.values.forEach { it.client.stopIdle() }
            watchers.clear()
        }
        scope.cancel()
        super.onDestroy()
    }

    /** Gibt false zurück, wenn Android den Vordergrund-Start gerade nicht erlaubt. */
    private fun startInForeground(): Boolean {
        ensureStatusChannel(this)
        // Antippen führt direkt zur Einstellung, mit der man diese Meldung ausblendet.
        val hide = PendingIntent.getActivity(
            this,
            1,
            statusSettingsIntent(this),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_mail)
            .setContentTitle("Wartet auf neue E-Mails")
            .setContentText("Antippen, um diese Meldung auszublenden")
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(hide)
            .build()
        return runCatching {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0,
            )
        }.isSuccess
    }

    /** Gleicht die Verbindungen mit den eingerichteten Konten ab. */
    private fun reload() {
        val accounts = AccountStore(this).accounts()
        if (accounts.isEmpty() || !enabled(this)) {
            stopSelf()
            return
        }
        synchronized(watchers) {
            val ids = accounts.map { it.id }.toSet()
            watchers.keys.filter { it !in ids }.forEach { id -> watchers.remove(id)?.stop() }
            for (account in accounts) {
                val current = watchers[account.id]
                if (current != null && current.account == account && current.job.isActive) continue
                current?.stop()
                watchers[account.id] = watch(account)
            }
        }
    }

    private fun Watcher.stop() {
        job.cancel()
        client.stopIdle()
    }

    private fun watch(account: Account): Watcher {
        val client = MailClient(account, AccountStore(this).password(account.id))
        val job = scope.launch {
            // Beim Start einmal nachsehen, was seit dem letzten Mal angekommen ist.
            NewMailWorker.check(this@PushService, account)
            var failures = 0
            while (isActive) {
                val started = SystemClock.elapsedRealtime()
                val supportsIdle = try {
                    runInterruptible {
                        client.idleInbox {
                            scope.launch { withWakeLock { NewMailWorker.check(this@PushService, account) } }
                        }
                    }
                } catch (e: Exception) {
                    if (!isActive) break
                    // Lief die Verbindung eine Weile, ist das ein neuer Abbruch, keine Fehlerserie.
                    failures = if (SystemClock.elapsedRealtime() - started > 60_000) 1 else failures + 1
                    null
                }
                when (supportsIdle) {
                    // Server ohne IDLE: regelmäßig nachfragen.
                    false -> {
                        withTimeoutOrNull(POLL_MS) { kick.first() }
                        withWakeLock { NewMailWorker.check(this@PushService, account) }
                    }
                    // Verbindung sauber beendet (z. B. vom Server): gleich wieder verbinden und
                    // nachholen, was in der Zwischenzeit kam.
                    true -> {
                        failures = 0
                        withWakeLock { NewMailWorker.check(this@PushService, account) }
                    }
                    // Fehler: mit wachsender Pause neu versuchen, bei Netz sofort.
                    null -> {
                        val wait = (RETRY_MS shl (failures - 1).coerceIn(0, 5)).coerceAtMost(MAX_RETRY_MS)
                        withTimeoutOrNull(wait) { kick.first() }
                        withWakeLock { NewMailWorker.check(this@PushService, account) }
                    }
                }
            }
        }
        return Watcher(account, client, job)
    }

    /** Vom Wecker: Verbindungen anstupsen, damit tote auffallen und Router sie nicht kappen. */
    private fun ping() {
        acquireWakeLock(30_000)
        kick.tryEmit(Unit)
        val clients = synchronized(watchers) { watchers.values.map { it.client } }
        scope.launch { clients.forEach { runCatching { it.pingIdle() } } }
    }

    private suspend fun <T> withWakeLock(block: suspend () -> T): T {
        val lock = acquireWakeLock(60_000)
        try {
            return block()
        } finally {
            if (lock.isHeld) runCatching { lock.release() }
        }
    }

    @SuppressLint("WakelockTimeout")
    private fun acquireWakeLock(timeout: Long): PowerManager.WakeLock =
        getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LunaMail:push")
            .apply {
                setReferenceCounted(false)
                acquire(timeout)
            }

    private fun keepAliveIntent(): PendingIntent = PendingIntent.getService(
        this,
        2,
        Intent(this, PushService::class.java).setAction(ACTION_PING),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    /** Weckt das Gerät auch im Ruhemodus etwa alle neun Minuten kurz auf. */
    private fun scheduleKeepAlive() {
        val alarms = getSystemService(AlarmManager::class.java)
        alarms.setAndAllowWhileIdle(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            SystemClock.elapsedRealtime() + KEEP_ALIVE_MS,
            keepAliveIntent(),
        )
    }

    private fun cancelKeepAlive() {
        getSystemService(AlarmManager::class.java).cancel(keepAliveIntent())
    }

    companion object {
        private const val CHANNEL_ID = "push"
        private const val NOTIFICATION_ID = 7001
        private const val ACTION_PING = "com.lunamail.app.PING"
        private const val KEEP_ALIVE_MS = 9 * 60_000L
        private const val POLL_MS = 5 * 60_000L
        private const val RETRY_MS = 15_000L
        private const val MAX_RETRY_MS = 10 * 60_000L
        private const val KEY_BATTERY_ASKED = "battery_asked"

        private fun prefs(context: Context) = context.getSharedPreferences("settings", Context.MODE_PRIVATE)

        private fun ensureStatusChannel(context: Context) {
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Verbindung zum Postfach", NotificationManager.IMPORTANCE_MIN).apply {
                    description = "Hält die Verbindung offen, damit neue E-Mails sofort ankommen. Kann ausgeblendet werden."
                    setShowBadge(false)
                }
            )
        }

        private fun statusSettingsIntent(context: Context): Intent =
            Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                .putExtra(Settings.EXTRA_CHANNEL_ID, CHANNEL_ID)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

        /**
         * Öffnet die Android-Einstellung für die dauerhafte Meldung „Wartet auf neue E-Mails“.
         * Dort ausgeschaltet verschwindet sie, neue E-Mails werden trotzdem gemeldet.
         */
        fun openStatusSettings(context: Context) {
            ensureStatusChannel(context)
            runCatching { context.startActivity(statusSettingsIntent(context)) }.onFailure {
                runCatching {
                    context.startActivity(
                        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                }
            }
        }

        fun enabled(context: Context) = prefs(context).getBoolean(MailViewModel.KEY_NOTIFICATIONS, true)

        /** Startet, aktualisiert oder beendet den Dienst passend zu Konten und Einstellung. */
        fun sync(context: Context) {
            val wanted = enabled(context) && AccountStore(context).accounts().isNotEmpty()
            val intent = Intent(context, PushService::class.java)
            if (wanted) {
                // Aus dem Hintergrund darf Android den Start verweigern; dann holt es der
                // nächste App-Start oder der regelmäßige Abgleich nach.
                runCatching { ContextCompat.startForegroundService(context, intent) }
            } else {
                context.stopService(intent)
            }
        }

        /**
         * Fragt einmal, ob LunaMail vom Akku-Sparen ausgenommen werden darf. Ohne das legt
         * Samsung die App schlafen und trennt die Verbindung.
         */
        @SuppressLint("BatteryLife")
        fun askBatteryExemption(context: Context) {
            val power = context.getSystemService(PowerManager::class.java)
            if (power.isIgnoringBatteryOptimizations(context.packageName)) return
            if (prefs(context).getBoolean(KEY_BATTERY_ASKED, false)) return
            prefs(context).edit().putBoolean(KEY_BATTERY_ASKED, true).apply()
            runCatching {
                context.startActivity(
                    Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}"))
                )
            }
        }
    }
}

/** Startet die Verbindung nach einem Neustart des Geräts oder einem App-Update wieder. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> PushService.sync(context)
        }
    }
}
