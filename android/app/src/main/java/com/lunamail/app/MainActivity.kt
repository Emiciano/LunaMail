package com.lunamail.app

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Looper
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.lunamail.app.ui.LunaMailApp
import com.lunamail.app.ui.screens.ComposeRequest
import kotlinx.coroutines.flow.MutableStateFlow

class MainActivity : ComponentActivity() {
    private val mailto = MutableStateFlow<ComposeRequest?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        // Die Symbolfarbe der Systemleisten setzt LunaMailTheme passend zum gewählten Design.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) handle(intent)
        NewMailWorker.schedule(
            this,
            getSharedPreferences("settings", MODE_PRIVATE).getBoolean(com.lunamail.app.ui.MailViewModel.KEY_NOTIFICATIONS, true),
        )
        PushService.sync(this)
        setContent {
            LunaMailApp(mailtoRequests = mailto, onMailtoHandled = { mailto.value = null })
        }
        // Das erste WebView lädt die ganze Chromium-Engine und blockiert dafür kurz den
        // UI-Thread. Das passiert hier einmal im Leerlauf nach dem Start, statt beim Öffnen
        // der ersten E-Mail mitten in der Animation.
        if (savedInstanceState == null) {
            Looper.myQueue().addIdleHandler {
                runCatching { WebView(this).destroy() }
                false
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "mailto") return
        mailto.value = parseMailto(data)
    }

    private fun parseMailto(uri: Uri): ComposeRequest {
        val raw = uri.toString().removePrefix("mailto:")
        val to = Uri.decode(raw.substringBefore('?'))
        val query = raw.substringAfter('?', "")
            .split('&')
            .filter { it.contains('=') }
            .associate { it.substringBefore('=').lowercase() to Uri.decode(it.substringAfter('=')) }
        return ComposeRequest(
            to = listOfNotNull(to.takeIf { it.isNotBlank() }, query["to"]).joinToString(", "),
            subject = query["subject"].orEmpty(),
            body = query["body"].orEmpty(),
        )
    }
}
