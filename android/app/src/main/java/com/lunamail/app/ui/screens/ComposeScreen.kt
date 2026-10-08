package com.lunamail.app.ui.screens

import com.lunamail.app.ui.icons.LunaIcons
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lunamail.app.data.Draft
import com.lunamail.app.data.MessageBody
import com.lunamail.app.data.MessageSummary
import com.lunamail.app.ui.MailViewModel
import com.lunamail.app.ui.components.AccountAvatar
import com.lunamail.app.ui.components.SquareButton
import com.lunamail.app.ui.components.formatLongDate
import com.lunamail.app.ui.components.inverseSurface
import com.lunamail.app.ui.components.pressFade
import com.lunamail.app.ui.theme.screenBackground
import androidx.compose.foundation.layout.height
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.lunamail.app.ui.theme.Luna
import com.lunamail.app.ui.theme.LunaType
import kotlinx.coroutines.launch

data class ComposeRequest(
    val accountId: String? = null,
    val to: String = "",
    val cc: String = "",
    val subject: String = "",
    val body: String = "",
    val inReplyTo: String? = null,
    val references: String? = null,
) {
    companion object {
        fun create(kind: ReplyKind, message: MessageSummary, body: MessageBody?, ownAddress: String?): ComposeRequest = when (kind) {
            ReplyKind.Reply -> reply(message, body)
            ReplyKind.ReplyAll -> replyAll(message, body, ownAddress)
            ReplyKind.Forward -> forward(message, body)
        }

        private fun originalText(message: MessageSummary, body: MessageBody?) =
            (body?.text ?: body?.html?.let { com.lunamail.app.data.MailClient.htmlToText(it) } ?: message.preview.orEmpty()).trim()

        private fun prefixed(subject: String, prefix: String, vararg known: String) =
            if (known.any { subject.startsWith(it, true) }) subject else "$prefix $subject"

        fun reply(message: MessageSummary, body: MessageBody?): ComposeRequest {
            val quoted = originalText(message, body).lines().joinToString("\n") { "> $it" }
            val references = listOfNotNull(body?.references?.takeIf { it.isNotBlank() }, message.messageId.takeIf { it.isNotBlank() })
                .joinToString(" ")
            return ComposeRequest(
                accountId = message.accountId,
                to = body?.replyTo?.takeIf { it.isNotBlank() } ?: message.fromAddress,
                subject = prefixed(message.subject, "Re:", "Re:", "AW:"),
                body = "\n\nAm ${formatLongDate(message.date)} schrieb ${message.senderLabel}:\n\n$quoted",
                inReplyTo = message.messageId.takeIf { it.isNotBlank() },
                references = references.takeIf { it.isNotBlank() },
            )
        }

        fun replyAll(message: MessageSummary, body: MessageBody?, ownAddress: String?): ComposeRequest {
            val base = reply(message, body)
            val own = ownAddress?.lowercase()
            fun addresses(list: String) = list.split(',').map { it.trim() }.filter { it.isNotBlank() }
            fun mailOf(entry: String) = entry.substringAfter('<').substringBefore('>').trim().lowercase()
            val primary = addresses(base.to)
            val seen = primary.map { mailOf(it) }.toMutableSet()
            val others = (addresses(body?.to?.ifBlank { message.to } ?: message.to) + addresses(body?.cc.orEmpty()))
                .filter { val m = mailOf(it); m != own && seen.add(m) }
            return base.copy(cc = others.joinToString(", "))
        }

        fun forward(message: MessageSummary, body: MessageBody?): ComposeRequest {
            val header = buildString {
                append("\n\nAnfang der weitergeleiteten E-Mail:\n\n")
                append("Von: ${message.fromName.ifBlank { message.fromAddress }} <${message.fromAddress}>\n")
                append("Betreff: ${message.subject}\n")
                append("Datum: ${formatLongDate(message.date)}\n")
                val to = body?.to?.ifBlank { message.to } ?: message.to
                if (to.isNotBlank()) append("An: $to\n")
                append("\n")
            }
            return ComposeRequest(
                accountId = message.accountId,
                subject = prefixed(message.subject, "Fwd:", "Fwd:", "WG:", "Fw:"),
                body = header + originalText(message, body),
            )
        }
    }
}

@Composable
fun ComposeScreen(vm: MailViewModel, request: ComposeRequest, onClose: () -> Unit) {
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    var accountId by rememberSaveable { mutableStateOf(request.accountId ?: accounts.firstOrNull()?.id) }
    val account = accounts.firstOrNull { it.id == accountId } ?: accounts.firstOrNull()

    var to by rememberSaveable { mutableStateOf(request.to) }
    var cc by rememberSaveable { mutableStateOf(request.cc) }
    var bcc by rememberSaveable { mutableStateOf("") }
    var subject by rememberSaveable { mutableStateOf(request.subject) }
    var body by rememberSaveable { mutableStateOf(request.body) }
    var expanded by rememberSaveable { mutableStateOf(request.cc.isNotBlank()) }
    var sending by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var draftError by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val toFocus = remember { FocusRequester() }
    val bodyFocus = remember { FocusRequester() }
    val colors = Luna.colors

    fun draft(sender: com.lunamail.app.data.Account) = Draft(
        accountId = sender.id,
        to = to,
        cc = cc,
        bcc = bcc,
        subject = subject,
        body = body,
        inReplyTo = request.inReplyTo,
        references = request.references,
    )

    val dirty = to != request.to || subject != request.subject || body != request.body || cc != request.cc || bcc.isNotBlank()

    /** Schließen sichert angefangene E-Mails automatisch als Entwurf, wie im Prototyp. */
    fun close() {
        if (sending || saving) return
        val sender = account
        if (!dirty || sender == null) {
            onClose()
            return
        }
        saving = true
        scope.launch {
            vm.saveDraft(draft(sender))
                .onSuccess { onClose() }
                .onFailure { draftError = MailViewModel.friendlyError(it) }
            saving = false
        }
    }
    BackHandler { close() }

    val canSend = account != null && to.isNotBlank() && !sending

    Column(
        Modifier
            .fillMaxSize()
            .screenBackground()
            .windowInsetsPadding(WindowInsets.statusBars)
            .imePadding()
            .navigationBarsPadding(),
    ) {
        Box(Modifier.padding(top = 8.dp).size(40.dp, 5.dp).clip(RoundedCornerShape(3.dp)).background(colors.strongFill).align(Alignment.CenterHorizontally))
        Row(
            Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, top = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (saving) {
                Box(Modifier.size(42.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = colors.secondaryLabel, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                }
            } else {
                SquareButton(LunaIcons.ChevronDown, "Schließen") { close() }
            }
            Spacer(Modifier.weight(1f))
            Row(
                Modifier
                    .height(42.dp)
                    .inverseSurface(colors.inverseBrush, RoundedCornerShape(8.dp))
                    .pressFade(enabled = canSend) {
                        val sender = account ?: return@pressFade
                        sending = true
                        scope.launch {
                            vm.send(draft(sender))
                                .onSuccess { onClose() }
                                .onFailure { error = MailViewModel.friendlyError(it) }
                            sending = false
                        }
                    }
                    .padding(horizontal = 18.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (sending) {
                    CircularProgressIndicator(color = colors.onInverse, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                } else {
                    Icon(LunaIcons.Send, contentDescription = null, tint = colors.onInverse, modifier = Modifier.size(16.dp))
                }
                Spacer(Modifier.width(8.dp))
                Text("Senden", style = LunaType.button.copy(fontSize = 14.5.sp), color = colors.onInverse)
            }
        }

        Text(
            subject.ifBlank { "Neue E-Mail" },
            style = LunaType.subjectTitle,
            color = colors.label,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 10.dp),
        )

        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            HeaderField("An", to, { to = it }, KeyboardType.Email, Modifier.focusRequester(toFocus), placeholder = "Name oder E-Mail")
            if (expanded) {
                HeaderField("Kopie", cc, { cc = it }, KeyboardType.Email)
                HeaderField("Blind", bcc, { bcc = it }, KeyboardType.Email)
            }
            FromField(
                vm = vm,
                current = account,
                options = accounts,
                onSelect = { accountId = it },
                onExpand = if (expanded) null else ({ expanded = true }),
            )
            HeaderField("Betreff", subject, { subject = it }, KeyboardType.Text, capitalize = true)

            Box(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp)) {
                if (body.isEmpty()) Text("Nachricht", style = LunaType.body.copy(fontSize = 16.5.sp), color = colors.tertiaryLabel)
                BasicTextField(
                    value = body,
                    onValueChange = { body = it },
                    textStyle = LunaType.body.copy(color = colors.label, fontSize = 16.5.sp, lineHeight = 25.sp),
                    cursorBrush = SolidColor(colors.label),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 320.dp)
                        .focusRequester(bodyFocus),
                )
            }
        }
    }

    LaunchedEffect(Unit) {
        runCatching { if (request.to.isBlank()) toFocus.requestFocus() else bodyFocus.requestFocus() }
    }

    draftError?.let { message ->
        AlertDialog(
            onDismissRequest = { draftError = null },
            title = { Text("Entwurf nicht gespeichert") },
            text = { Text(message) },
            confirmButton = { TextButton(onClick = { draftError = null }) { Text("Weiterschreiben", color = colors.label) } },
            dismissButton = {
                TextButton(onClick = { draftError = null; onClose() }) { Text("Verwerfen", color = colors.red) }
            },
        )
    }

    error?.let { message ->
        AlertDialog(
            onDismissRequest = { error = null },
            title = { Text("Das hat nicht geklappt") },
            text = { Text(message) },
            confirmButton = { TextButton(onClick = { error = null }) { Text("OK", color = colors.label) } },
        )
    }
}

@Composable
private fun HeaderField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    keyboardType: KeyboardType,
    modifier: Modifier = Modifier,
    capitalize: Boolean = false,
    placeholder: String = "",
) {
    val colors = Luna.colors
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
        Row(Modifier.heightIn(min = 50.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = LunaType.callout.copy(fontWeight = FontWeight.Medium), color = colors.secondaryLabel, modifier = Modifier.width(66.dp))
            Box(Modifier.weight(1f)) {
                if (value.isEmpty() && placeholder.isNotEmpty()) Text(placeholder, style = LunaType.callout, color = colors.tertiaryLabel)
                BasicTextField(
                    value = value,
                    onValueChange = onValueChange,
                    singleLine = true,
                    textStyle = LunaType.callout.copy(color = colors.label),
                    cursorBrush = SolidColor(colors.label),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = keyboardType,
                        capitalization = if (capitalize) KeyboardCapitalization.Sentences else KeyboardCapitalization.None,
                        autoCorrectEnabled = capitalize,
                    ),
                    modifier = modifier.fillMaxWidth(),
                )
            }
        }
        HorizontalDivider(thickness = 1.dp, color = colors.separator)
    }
}

/** „Von“ als Chip mit Kontobild; bei mehreren Konten öffnet Antippen die Auswahl. */
@Composable
private fun FromField(
    vm: MailViewModel,
    current: com.lunamail.app.data.Account?,
    options: List<com.lunamail.app.data.Account>,
    onSelect: (String) -> Unit,
    onExpand: (() -> Unit)?,
) {
    var open by remember { mutableStateOf(false) }
    val pictures by vm.pictures.collectAsStateWithLifecycle()
    val colors = Luna.colors
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
        Row(Modifier.heightIn(min = 50.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Von", style = LunaType.callout.copy(fontWeight = FontWeight.Medium), color = colors.secondaryLabel, modifier = Modifier.width(66.dp))
            Box(Modifier.weight(1f)) {
                Row(
                    Modifier
                        .height(32.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(colors.cell)
                        .pressFade(enabled = options.size > 1) { open = true }
                        .padding(start = 4.dp, end = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    AccountAvatar(current, current?.let { vm.pictureFile(it.id) }, current?.let { pictures[it.id] }, size = 24.dp, radius = 12.dp)
                    Spacer(Modifier.width(6.dp))
                    Text(current?.email.orEmpty(), style = LunaType.subhead.copy(fontWeight = FontWeight.SemiBold), color = colors.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (options.size > 1) {
                        Spacer(Modifier.width(4.dp))
                        Icon(LunaIcons.ChevronDown, contentDescription = null, tint = colors.label, modifier = Modifier.size(14.dp))
                    }
                }
                DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                    options.forEach { account ->
                        DropdownMenuItem(text = { Text("${account.displayName} <${account.email}>") }, onClick = { open = false; onSelect(account.id) })
                    }
                }
            }
            if (onExpand != null) {
                Text(
                    "Kopie",
                    style = LunaType.subhead.copy(fontWeight = FontWeight.SemiBold),
                    color = colors.secondaryLabel,
                    modifier = Modifier.pressFade(onClick = onExpand).padding(start = 8.dp, top = 6.dp, bottom = 6.dp),
                )
            }
        }
        HorizontalDivider(thickness = 1.dp, color = colors.separator)
    }
}
