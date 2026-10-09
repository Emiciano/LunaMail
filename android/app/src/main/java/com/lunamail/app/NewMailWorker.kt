package com.lunamail.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.lunamail.app.data.Account
import com.lunamail.app.data.AccountStore
import com.lunamail.app.data.BoxRef
import com.lunamail.app.data.MailCache
import com.lunamail.app.data.MailClient
import com.lunamail.app.data.MessageSummary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.TimeUnit

/** Prüft regelmäßig die Eingänge und meldet neue, ungelesene E-Mails (Ergänzung zu [PushService]). */
class NewMailWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val context = applicationContext
        // Sicherheitsnetz neben der Push-Verbindung; startet sie auch neu, falls sie beendet wurde.
        PushService.sync(context)
        for (account in AccountStore(context).accounts()) check(context, account)
        return Result.success()
    }

    companion object {
        private const val CHANNEL_ID = "new_mail"
        private const val WORK_NAME = "new-mail-check"
        private val checkLock = Mutex()

        /** Neue E-Mails im Eingang eines Kontos holen, im Cache ablegen und melden. */
        suspend fun check(context: Context, account: Account) = checkLock.withLock {
            withContext(Dispatchers.IO) {
                val store = AccountStore(context)
                val cache = MailCache(File(context.filesDir, "mail"))
                val client = MailClient(account, store.password(account.id))
                try {
                    val box = BoxRef(account.id, "INBOX")
                    val cached = cache.messages(box)
                    val known = cached.associateBy { it.uid }
                    val fresh = client.fetchMessages("INBOX", limit = 25)
                    val oldest = fresh.minOfOrNull { it.uid } ?: return@withContext
                    // Beim allerersten Abruf nichts melden, sonst käme eine Flut alter Mails.
                    val incoming = if (cached.isEmpty()) emptyList() else fresh.filter { it.uid !in known && !it.seen }
                    val merged = fresh.map { it.copy(preview = known[it.uid]?.preview) } + cached.filter { it.uid < oldest }
                    cache.saveMessages(box, merged)
                    if (incoming.isNotEmpty()) {
                        val withPreviews = runCatching {
                            val previews = client.fetchPreviews("INBOX", incoming.map { it.uid })
                            incoming.map { m -> previews[m.uid]?.let { m.copy(preview = it) } ?: m }
                        }.getOrDefault(incoming)
                        notify(context, account.description, withPreviews)
                        MailEvents.inboxChanged.tryEmit(account.id)
                    }
                } catch (_: Exception) {
                    // Netz weg oder Server nicht erreichbar: beim nächsten Lauf erneut versuchen.
                } finally {
                    client.close()
                }
            }
        }

        private fun notify(context: Context, accountName: String, messages: List<MessageSummary>) {
            if (Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) return
            ensureChannel(context)
            val open = PendingIntent.getActivity(
                context,
                0,
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val manager = NotificationManagerCompat.from(context)
            val group = "lunamail-$accountName"
            messages.take(5).forEach { message ->
                val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_stat_mail)
                    .setContentTitle(message.senderLabel)
                    .setContentText(message.subject.ifBlank { "(Kein Betreff)" })
                    .setStyle(
                        NotificationCompat.BigTextStyle().bigText(
                            listOfNotNull(message.subject.ifBlank { null }, message.preview?.takeIf { it.isNotBlank() }).joinToString("\n")
                        )
                    )
                    .setSubText(accountName)
                    .setWhen(message.date)
                    .setGroup(group)
                    .setAutoCancel(true)
                    .setContentIntent(open)
                    .build()
                runCatching { manager.notify(message.key.hashCode(), notification) }
            }
            if (messages.size > 1) {
                val summary = NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_stat_mail)
                    .setContentTitle("${messages.size} neue E-Mails")
                    .setSubText(accountName)
                    .setGroup(group)
                    .setGroupSummary(true)
                    .setAutoCancel(true)
                    .setContentIntent(open)
                    .build()
                runCatching { manager.notify(group.hashCode(), summary) }
            }
        }

        fun ensureChannel(context: Context) {
            val channel = NotificationChannel(CHANNEL_ID, "Neue E-Mails", NotificationManager.IMPORTANCE_DEFAULT)
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        fun schedule(context: Context, enabled: Boolean) {
            val work = WorkManager.getInstance(context)
            if (!enabled) {
                work.cancelUniqueWork(WORK_NAME)
                return
            }
            val request = PeriodicWorkRequestBuilder<NewMailWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            work.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
