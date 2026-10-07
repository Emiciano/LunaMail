package com.lunamail.app.ui.screens

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.MimeTypeMap
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
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
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.DriveFileMove
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewFeature
import com.lunamail.app.data.AttachmentInfo
import com.lunamail.app.data.BoxRef
import com.lunamail.app.data.MessageBody
import com.lunamail.app.data.MessageSummary
import com.lunamail.app.ui.MailViewModel
import com.lunamail.app.ui.components.Avatar
import com.lunamail.app.ui.components.BackButton
import com.lunamail.app.ui.components.BarIcon
import com.lunamail.app.ui.components.BottomToolbar
import com.lunamail.app.ui.components.NavigationBar
import com.lunamail.app.ui.components.formatLongDate
import com.lunamail.app.ui.components.pressFade
import com.lunamail.app.ui.theme.Luna
import com.lunamail.app.ui.theme.LunaColors
import com.lunamail.app.ui.theme.LunaType
import kotlinx.coroutines.launch

@Composable
fun MessageScreen(
    vm: MailViewModel,
    messageKey: String,
    box: BoxRef?,
    backLabel: String,
    onBack: () -> Unit,
    onReply: (MessageSummary, MessageBody?, ReplyKind) -> Unit,
    onCompose: () -> Unit,
) {
    // Mit den Pfeilen oben rechts blättert man wie in Apple Mail durch das Postfach,
    // ohne die Ansicht zu verlassen.
    var currentKey by rememberSaveable(messageKey) { mutableStateOf(messageKey) }
    var direction by remember { mutableStateOf(1) }

    // Die Nachricht wird live gelesen, damit Markierungen sofort sichtbar sind. Wird sie
    // archiviert oder gelöscht, bleibt der letzte Stand sichtbar, bis die Ansicht wechselt.
    val index by vm.allMessages.collectAsStateWithLifecycle()
    var lastKnown by remember(currentKey) { mutableStateOf(vm.findMessage(currentKey)) }
    val live = remember(index, currentKey) { vm.findMessage(currentKey) }
    if (live != null && live != lastKnown) lastKnown = live
    val message = live ?: lastKnown
    if (message == null) {
        LaunchedEffect(Unit) { onBack() }
        return
    }

    val siblings = remember(index, box) { box?.let { vm.messagesNow(it) }.orEmpty() }
    val position = siblings.indexOfFirst { it.key == currentKey }
    val newer = if (position > 0) siblings[position - 1] else null
    val older = if (position >= 0) siblings.getOrNull(position + 1) else null

    fun show(target: MessageSummary?, down: Boolean) {
        if (target == null) return
        direction = if (down) 1 else -1
        currentKey = target.key
    }

    /** Nach Löschen/Archivieren/Bewegen zur nächsten E-Mail wechseln, wie Apple Mail. */
    fun afterRemoval() {
        when {
            older != null -> show(older, down = true)
            newer != null -> show(newer, down = false)
            else -> onBack()
        }
    }

    var body by remember(currentKey) { mutableStateOf<MessageBody?>(null) }
    var showActions by remember { mutableStateOf(false) }
    var showMove by remember { mutableStateOf(false) }
    val background = Luna.colors.background

    Column(Modifier.fillMaxSize().background(background)) {
        NavigationBar(
            title = "",
            collapsed = true,
            background = background,
            navigation = { BackButton(backLabel, onBack) },
            actions = {
                if (box != null) {
                    BarIcon(Icons.Rounded.KeyboardArrowUp, "Vorherige E-Mail", enabled = newer != null) { show(newer, down = false) }
                    BarIcon(Icons.Rounded.KeyboardArrowDown, "Nächste E-Mail", enabled = older != null) { show(older, down = true) }
                }
            },
        )

        AnimatedContent(
            targetState = message,
            contentKey = { it.key },
            transitionSpec = {
                (slideInVertically(tween(320)) { it / 4 * direction } + fadeIn(tween(320))) togetherWith
                    (slideOutVertically(tween(320)) { -it / 4 * direction } + fadeOut(tween(200)))
            },
            modifier = Modifier.weight(1f),
            label = "message",
        ) { shown ->
            MessageContent(vm, shown) { loaded -> if (shown.key == currentKey) body = loaded }
        }

        val archives = vm.swipeArchives.collectAsStateWithLifecycle().value && vm.canArchive(message)
        BottomToolbar {
            BarIcon(
                if (message.flagged) Icons.Rounded.Flag else Icons.Outlined.Flag,
                if (message.flagged) "Markierung entfernen" else "Markieren",
                tint = if (message.flagged) Luna.colors.orange else Luna.colors.accent,
            ) { vm.setFlagged(message, !message.flagged) }
            BarIcon(Icons.Outlined.DriveFileMove, "Bewegen") { showMove = true }
            if (archives) {
                BarIcon(Icons.Outlined.Archive, "Archivieren") {
                    vm.archive(message)
                    afterRemoval()
                }
            } else {
                BarIcon(Icons.Outlined.Delete, "Löschen") {
                    vm.delete(message)
                    afterRemoval()
                }
            }
            BarIcon(Icons.AutoMirrored.Outlined.Reply, "Antworten") { showActions = true }
            BarIcon(Icons.Outlined.EditNote, "Neue E-Mail", onClick = onCompose)
        }
    }

    if (showActions) {
        MessageActionsSheet(
            vm = vm,
            message = message,
            onDismiss = { showActions = false },
            onReply = { kind -> onReply(message, body, kind) },
            onMove = { showMove = true },
            onRemoved = { afterRemoval() },
        )
    }
    if (showMove) {
        MoveSheet(vm, message.accountId, message.folder, onDismiss = { showMove = false }) { target ->
            vm.moveTo(message, target)
            afterRemoval()
        }
    }
}

@Composable
private fun MessageContent(vm: MailViewModel, message: MessageSummary, onBody: (MessageBody) -> Unit) {
    var body by remember(message.key) { mutableStateOf<MessageBody?>(null) }
    var error by remember(message.key) { mutableStateOf<String?>(null) }
    LaunchedEffect(message.key) {
        vm.setSeen(message, true)
        vm.loadBody(message)
            .onSuccess { body = it; onBody(it) }
            .onFailure { error = it.message }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
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
            attachments.forEach { attachment -> AttachmentRow(vm, message, attachment) }
        }
        Spacer(Modifier.height(32.dp))
    }
}

/** Antippen lädt den Anhang und öffnet ihn mit einer passenden App. */
@Composable
private fun AttachmentRow(vm: MailViewModel, message: MessageSummary, attachment: AttachmentInfo) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf<String?>(null) }
    Row(
        Modifier
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Luna.colors.fill)
            .pressFade(enabled = !loading) {
                loading = true
                failed = null
                scope.launch {
                    vm.downloadAttachment(message, attachment)
                        .onSuccess { file ->
                            val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
                            val mime = attachment.mimeType.substringBefore(';').trim().lowercase()
                                .takeIf { it.contains('/') && it != "application/octet-stream" }
                                ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension.lowercase())
                                ?: "*/*"
                            val intent = Intent(Intent.ACTION_VIEW)
                                .setDataAndType(uri, mime)
                                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            runCatching { context.startActivity(Intent.createChooser(intent, attachment.fileName)) }
                                .onFailure { failed = "Keine App zum Öffnen gefunden" }
                        }
                        .onFailure { failed = it.message }
                    loading = false
                }
            }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Rounded.AttachFile, null, tint = Luna.colors.accent, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            Text(attachment.fileName, style = LunaType.subhead, color = Luna.colors.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
            failed?.let { Text(it, style = LunaType.caption, color = Luna.colors.red, maxLines = 2) }
        }
        if (loading) {
            CircularProgressIndicator(color = Luna.colors.secondaryLabel, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
        } else if (attachment.size > 0) {
            Text(formatSize(attachment.size), style = LunaType.footnote, color = Luna.colors.secondaryLabel)
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
    // HTML-Mails sind fast immer für hellen Hintergrund gestaltet. Automatisch abgedunkelt
    // verschwinden dunkle Logos mit transparentem Hintergrund, darum liegen sie auf einer weißen Karte.
    val background = android.graphics.Color.WHITE
    val document = remember(html, colors.isDark) {
        """
        <!DOCTYPE html><html><head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          html, body { margin: 0; padding: 0; }
          body { padding: 12px; font-family: sans-serif; font-size: 16px; line-height: 1.4;
                 overflow-wrap: break-word; word-wrap: break-word; }
          img { max-width: 100% !important; height: auto !important; }
          table { max-width: 100% !important; }
          pre { white-space: pre-wrap; }
          body { color: #111; background: #fff; }
          a { color: #0A66D8; }
        </style></head><body>$html</body></html>
        """.trimIndent()
    }
    // Ein WebView in einer scrollenden Spalte misst sich selbst oft mit Höhe 0. Darum wird
    // die Inhaltshöhe nach dem Laden ausgelesen und als feste Höhe gesetzt.
    var contentHeight by remember(document) { mutableStateOf(0) }
    val density = androidx.compose.ui.platform.LocalDensity.current
    AndroidView(
        modifier = Modifier
            .padding(horizontal = 8.dp)
            .clip(RoundedCornerShape(10.dp))
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
                // Bilder aus dem Netz (Logos, Newsletter) laden, auch über http.
                settings.loadsImagesAutomatically = true
                settings.blockNetworkImage = false
                settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                    WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false)
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
                        // Bilder laden nach und machen die Seite höher; darum einige Sekunden
                        // lang regelmäßig nachmessen.
                        var remaining = 20
                        val again = object : Runnable {
                            override fun run() {
                                measure()
                                if (--remaining > 0) view.postDelayed(this, 500)
                            }
                        }
                        view.postDelayed(again, 300)
                    }

                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                        if (request.url.host == "mail.lunamail.invalid") return true
                        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(request.url.toString()))) }
                        return true
                    }
                }
            }
        },
        update = { view ->
            if (view.tag != document) {
                view.tag = document
                // Mit https-Basis laden auch Bilder mit „//cdn…/logo.png“ ohne Protokoll.
                view.loadDataWithBaseURL("https://mail.lunamail.invalid/", document, "text/html", "UTF-8", null)
            }
        },
    )
}

private fun formatSize(bytes: Int): String = when {
    bytes >= 1_000_000 -> "%.1f MB".format(bytes / 1_000_000f)
    bytes >= 1_000 -> "${bytes / 1_000} KB"
    else -> "$bytes Byte"
}
