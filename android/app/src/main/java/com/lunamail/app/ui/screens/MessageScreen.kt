package com.lunamail.app.ui.screens

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Reply
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.DriveFileMove
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.MarkEmailUnread
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import com.lunamail.app.data.MailboxRole
import com.lunamail.app.data.MessageBody
import com.lunamail.app.data.MessageSummary
import com.lunamail.app.ui.MailViewModel
import com.lunamail.app.ui.components.Avatar
import com.lunamail.app.ui.components.BackButton
import com.lunamail.app.ui.components.BarIcon
import com.lunamail.app.ui.components.BottomToolbar
import com.lunamail.app.ui.components.CellRow
import com.lunamail.app.ui.components.NavigationBar
import com.lunamail.app.ui.components.formatLongDate
import com.lunamail.app.ui.theme.Luna
import com.lunamail.app.ui.theme.LunaColors
import com.lunamail.app.ui.theme.LunaType

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MessageScreen(
    vm: MailViewModel,
    messageKey: String,
    backLabel: String,
    onBack: () -> Unit,
    onReply: (MessageSummary, MessageBody?) -> Unit,
    onCompose: () -> Unit,
) {
    // Die Nachricht wird live gelesen, damit Markierungen sofort sichtbar sind. Wird sie
    // archiviert oder gelöscht, bleibt der letzte Stand sichtbar, bis die Ansicht geschlossen ist.
    val index by vm.allMessages.collectAsStateWithLifecycle()
    var lastKnown by remember(messageKey) { mutableStateOf(vm.findMessage(messageKey)) }
    val live = remember(index, messageKey) { vm.findMessage(messageKey) }
    if (live != null && live != lastKnown) lastKnown = live
    val message = live ?: lastKnown
    if (message == null) {
        LaunchedEffect(Unit) { onBack() }
        return
    }

    var body by remember(messageKey) { mutableStateOf<MessageBody?>(null) }
    var error by remember(messageKey) { mutableStateOf<String?>(null) }
    LaunchedEffect(messageKey) {
        vm.setSeen(message, true)
        vm.loadBody(message)
            .onSuccess { body = it }
            .onFailure { error = it.message }
    }

    var showMove by remember { mutableStateOf(false) }
    val background = Luna.colors.background

    Column(Modifier.fillMaxSize().background(background)) {
        NavigationBar(
            title = "",
            collapsed = true,
            background = background,
            navigation = { BackButton(backLabel, onBack) },
            actions = {
                BarIcon(Icons.Outlined.MarkEmailUnread, "Als ungelesen markieren") {
                    vm.setSeen(message, false)
                    onBack()
                }
            },
        )

        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState()),
        ) {
            Header(message, body)
            HorizontalDivider(thickness = 0.5.dp, color = Luna.colors.separator, modifier = Modifier.padding(start = 16.dp))
            Spacer(Modifier.height(12.dp))
            when {
                error != null -> Text(
                    error!!,
                    style = LunaType.body,
                    color = Luna.colors.secondaryLabel,
                    modifier = Modifier.padding(16.dp),
                )
                body == null -> Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Luna.colors.secondaryLabel, strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
                }
                body!!.html != null -> HtmlBody(body!!.html!!, Luna.colors)
                else -> SelectionContainer {
                    Text(
                        body!!.text.orEmpty().trim(),
                        style = LunaType.body,
                        color = Luna.colors.label,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                }
            }
            body?.attachments?.takeIf { it.isNotEmpty() }?.let { attachments ->
                Spacer(Modifier.height(16.dp))
                attachments.forEach { attachment ->
                    Row(
                        Modifier
                            .padding(horizontal = 16.dp, vertical = 4.dp)
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(Luna.colors.fill)
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Rounded.AttachFile, null, tint = Luna.colors.secondaryLabel, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(attachment.fileName, style = LunaType.subhead, color = Luna.colors.label, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        if (attachment.size > 0) {
                            Text(formatSize(attachment.size), style = LunaType.footnote, color = Luna.colors.secondaryLabel)
                        }
                    }
                }
            }
            Spacer(Modifier.height(32.dp))
        }

        BottomToolbar {
            BarIcon(
                if (message.flagged) Icons.Rounded.Flag else Icons.Outlined.Flag,
                if (message.flagged) "Markierung entfernen" else "Markieren",
                tint = if (message.flagged) Luna.colors.orange else Luna.colors.accent,
            ) { vm.setFlagged(message, !message.flagged) }
            BarIcon(Icons.Outlined.DriveFileMove, "Bewegen") { showMove = true }
            BarIcon(Icons.Outlined.Delete, "Löschen") {
                vm.delete(message)
                onBack()
            }
            BarIcon(Icons.AutoMirrored.Outlined.Reply, "Antworten") { onReply(message, body) }
            BarIcon(Icons.Outlined.EditNote, "Neue E-Mail", onClick = onCompose)
        }
    }

    if (showMove) {
        val mailboxes by vm.mailboxes.collectAsStateWithLifecycle()
        ModalBottomSheet(onDismissRequest = { showMove = false }, containerColor = Luna.colors.groupedBackground) {
            Text(
                "Diese Nachricht bewegen",
                style = LunaType.headline,
                color = Luna.colors.label,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
            val targets = mailboxes[message.accountId].orEmpty()
                .filter { it.fullName != message.folder && it.role != MailboxRole.DRAFTS }
            Column(
                Modifier
                    .padding(16.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Luna.colors.cell)
                    .verticalScroll(rememberScrollState()),
            ) {
                targets.forEachIndexed { index, target ->
                    CellRow(
                        title = target.displayName,
                        icon = target.role.icon(),
                        showChevron = false,
                        showDivider = index < targets.lastIndex,
                    ) {
                        showMove = false
                        vm.moveTo(message, target)
                        onBack()
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
private fun Header(message: MessageSummary, body: MessageBody?) {
    Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Avatar(message.senderLabel, 44.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(message.senderLabel, style = LunaType.headline, color = Luna.colors.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                val to = body?.to?.takeIf { it.isNotBlank() } ?: message.to
                if (to.isNotBlank()) {
                    Text("An: $to", style = LunaType.subhead, color = Luna.colors.secondaryLabel, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                if (!body?.cc.isNullOrBlank()) {
                    Text("Kopie: ${body!!.cc}", style = LunaType.subhead, color = Luna.colors.secondaryLabel, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            if (message.flagged) {
                Icon(Icons.Rounded.Flag, null, tint = Luna.colors.orange, modifier = Modifier.size(16.dp))
            }
        }
        Spacer(Modifier.height(14.dp))
        Text(message.subject.ifBlank { "(Kein Betreff)" }, style = LunaType.title3, color = Luna.colors.label)
        Spacer(Modifier.height(2.dp))
        Text(formatLongDate(message.date), style = LunaType.subhead, color = Luna.colors.secondaryLabel)
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun HtmlBody(html: String, colors: LunaColors) {
    val background = colors.background.toArgb()
    val document = remember(html, colors.isDark) {
        """
        <!DOCTYPE html><html><head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          html, body { margin: 0; padding: 0; }
          body { padding: 0 16px; font-family: sans-serif; font-size: 16px; line-height: 1.4;
                 overflow-wrap: break-word; word-wrap: break-word; }
          img { max-width: 100% !important; height: auto !important; }
          table { max-width: 100% !important; }
          pre { white-space: pre-wrap; }
          a { color: #0A84FF; }
        </style></head><body>$html</body></html>
        """.trimIndent()
    }
    // Ein WebView in einer scrollenden Spalte misst sich selbst oft mit Höhe 0. Darum wird
    // die Inhaltshöhe nach dem Laden ausgelesen und als feste Höhe gesetzt.
    var contentHeight by remember(document) { mutableStateOf(0) }
    val density = androidx.compose.ui.platform.LocalDensity.current
    AndroidView(
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (contentHeight > 0) Modifier.height(with(density) { contentHeight.toDp() })
                else Modifier.heightIn(min = 120.dp)
            ),
        factory = { context ->
            WebView(context).apply {
                layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                setBackgroundColor(background)
                isVerticalScrollBarEnabled = false
                settings.javaScriptEnabled = false
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.loadWithOverviewMode = true
                settings.useWideViewPort = true
                settings.builtInZoomControls = true
                settings.displayZoomControls = false
                if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                    WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, true)
                }
                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String?) {
                        fun measure() {
                            // contentHeight ist in CSS-Pixeln; scale enthält Dichte und Übersichts-Zoom.
                            @Suppress("DEPRECATION")
                            val px = (view.contentHeight * view.scale).toInt()
                            if (px > 0 && px != contentHeight) contentHeight = px
                        }
                        measure()
                        // Bilder laden nach; die Höhe danach noch zweimal nachmessen.
                        view.postDelayed({ measure() }, 400)
                        view.postDelayed({ measure() }, 1500)
                    }

                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(request.url.toString()))) }
                        return true
                    }
                }
            }
        },
        update = { view ->
            if (view.tag != document) {
                view.tag = document
                view.loadDataWithBaseURL(null, document, "text/html", "UTF-8", null)
            }
        },
    )
}

private fun formatSize(bytes: Int): String = when {
    bytes >= 1_000_000 -> "%.1f MB".format(bytes / 1_000_000f)
    bytes >= 1_000 -> "${bytes / 1_000} KB"
    else -> "$bytes Byte"
}
