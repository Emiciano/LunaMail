package com.lunamail.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.lunamail.app.ui.LunaMailApp
import com.lunamail.app.ui.screens.ComposeRequest
import com.lunamail.app.ui.theme.LunaMailTheme
import kotlinx.coroutines.flow.MutableStateFlow

class MainActivity : ComponentActivity() {
    private val mailto = MutableStateFlow<ComposeRequest?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) handle(intent)
        setContent {
            LunaMailTheme {
                LunaMailApp(mailtoRequests = mailto, onMailtoHandled = { mailto.value = null })
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
