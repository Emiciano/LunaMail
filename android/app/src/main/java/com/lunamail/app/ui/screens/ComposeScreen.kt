package com.lunamail.app.ui.screens

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowUpward
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
import com.lunamail.app.ui.components.TextAction
import com.lunamail.app.ui.components.formatLongDate
import com.lunamail.app.ui.components.pressFade
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

@OptIn(ExperimentalMaterial3Api::class)
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
    var error by remember { mutableStateOf<String?>(null) }
    var confirmDiscard by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val toFocus = remember { FocusRequester() }
    val bodyFocus = remember { FocusRequester() }

    val dirty = to != request.to || subject != request.subject || body != request.body || cc != request.cc || bcc.isNotBlank()
    fun close() {
        if (dirty && !sending) confirmDiscard = true else onClose()
    }
    BackHandler { close() }

    val canSend = account != null && to.isNotBlank() && !sending

    Column(
        Modifier
            .fillMaxSize()
            .background(Luna.colors.background)
            .windowInsetsPadding(WindowInsets.statusBars)
            .imePadding()
            .navigationBarsPadding(),
    ) {
        Box(Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
            Box(Modifier.align(Alignment.CenterStart)) { TextAction("Abbrechen") { close() } }
            Box(
                Modifier
                    .align(Alignment.CenterEnd)
                    .padding(end = 12.dp)
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(if (canSend || sending) Luna.colors.accent else Luna.colors.fill)
                    .pressFade(enabled = canSend) {
                        val sender = account ?: return@pressFade
                        sending = true
                        scope.launch {
                            vm.send(
                                Draft(
                                    accountId = sender.id,
                                    to = to,
                                    cc = cc,
                                    bcc = bcc,
                                    subject = subject,
                                    body = body,
                                    inReplyTo = request.inReplyTo,
                                    references = request.references,
                                )
                            ).onSuccess { onClose() }
                                .onFailure { error = it.message }
                            sending = false
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                if (sending) {
                    CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                } else {
                    Icon(Icons.Rounded.ArrowUpward, "Senden", tint = if (canSend) Color.White else Luna.colors.tertiaryLabel, modifier = Modifier.size(20.dp))
                }
            }
        }

        Text(
            subject.ifBlank { "Neue E-Mail" },
            style = LunaType.title2,
            color = Luna.colors.label,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
        )

        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            HeaderField("An:", to, { to = it }, KeyboardType.Email, Modifier.focusRequester(toFocus))
            if (expanded) {
                HeaderField("Kopie:", cc, { cc = it }, KeyboardType.Email)
                HeaderField("Blindkopie:", bcc, { bcc = it }, KeyboardType.Email)
                FromField(
                    current = account?.email.orEmpty(),
                    options = accounts.map { it.id to "${it.displayName} <${it.email}>" },
                    onSelect = { accountId = it },
                )
            } else {
                Column(Modifier.fillMaxWidth().pressFade { expanded = true }) {
                    Text(
                        "Kopie/Blindkopie, Von: ${account?.email.orEmpty()}",
                        style = LunaType.body,
                        color = Luna.colors.secondaryLabel,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    )
                    HorizontalDivider(thickness = 0.5.dp, color = Luna.colors.separator, modifier = Modifier.padding(start = 16.dp))
                }
            }
            HeaderField("Betreff:", subject, { subject = it }, KeyboardType.Text, capitalize = true)

            BasicTextField(
                value = body,
                onValueChange = { body = it },
                textStyle = LunaType.body.copy(color = Luna.colors.label),
                cursorBrush = SolidColor(Luna.colors.accent),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 320.dp)
                    .padding(16.dp)
                    .focusRequester(bodyFocus),
            )
        }
    }

    LaunchedEffect(Unit) {
        runCatching { if (request.to.isBlank()) toFocus.requestFocus() else bodyFocus.requestFocus() }
    }

    if (confirmDiscard) {
        // Wie in Apple Mail: Entwurf löschen, sichern oder weiterschreiben.
        ModalBottomSheet(
            onDismissRequest = { confirmDiscard = false },
            containerColor = Luna.colors.groupedBackground,
        ) {
            Column(Modifier.navigationBarsPadding().padding(horizontal = 16.dp)) {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Luna.colors.cell)) {
                    SheetButton("Entwurf löschen", Luna.colors.red) {
                        confirmDiscard = false
                        onClose()
                    }
                    HorizontalDivider(thickness = 0.5.dp, color = Luna.colors.separator)
                    SheetButton("Entwurf sichern", Luna.colors.accent) {
                        val sender = account ?: return@SheetButton
                        confirmDiscard = false
                        scope.launch {
                            vm.saveDraft(
                                Draft(
                                    accountId = sender.id,
                                    to = to,
                                    cc = cc,
                                    bcc = bcc,
                                    subject = subject,
                                    body = body,
                                    inReplyTo = request.inReplyTo,
                                    references = request.references,
                                )
                            ).onSuccess { onClose() }
                                .onFailure { error = it.message }
                        }
                    }
                }
                Spacer(Modifier.heightIn(min = 8.dp))
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Luna.colors.cell)) {
                    SheetButton("Abbrechen", Luna.colors.accent, bold = true) { confirmDiscard = false }
                }
                Spacer(Modifier.heightIn(min = 16.dp))
            }
        }
    }

    error?.let { message ->
        AlertDialog(
            onDismissRequest = { error = null },
            title = { Text("Das hat nicht geklappt") },
            text = { Text(message) },
            confirmButton = { TextButton(onClick = { error = null }) { Text("OK") } },
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
) {
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = LunaType.body, color = Luna.colors.secondaryLabel)
            Spacer(Modifier.width(6.dp))
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle = LunaType.body.copy(color = Luna.colors.label),
                cursorBrush = SolidColor(Luna.colors.accent),
                keyboardOptions = KeyboardOptions(
                    keyboardType = keyboardType,
                    capitalization = if (capitalize) KeyboardCapitalization.Sentences else KeyboardCapitalization.None,
                    autoCorrectEnabled = capitalize,
                ),
                modifier = modifier.weight(1f),
            )
        }
        HorizontalDivider(thickness = 0.5.dp, color = Luna.colors.separator, modifier = Modifier.padding(start = 16.dp))
    }
}

@Composable
private fun FromField(current: String, options: List<Pair<String, String>>, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth()) {
        Box {
            Row(
                Modifier
                    .fillMaxWidth()
                    .pressFade(enabled = options.size > 1) { open = true }
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            ) {
                Text("Von:", style = LunaType.body, color = Luna.colors.secondaryLabel)
                Spacer(Modifier.width(6.dp))
                Text(current, style = LunaType.body, color = Luna.colors.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                options.forEach { (id, label) ->
                    DropdownMenuItem(text = { Text(label) }, onClick = { open = false; onSelect(id) })
                }
            }
        }
        HorizontalDivider(thickness = 0.5.dp, color = Luna.colors.separator, modifier = Modifier.padding(start = 16.dp))
    }
}

@Composable
private fun SheetButton(label: String, color: Color, bold: Boolean = false, onClick: () -> Unit) {
    Text(
        label,
        style = if (bold) LunaType.headline else LunaType.body,
        color = color,
        textAlign = TextAlign.Center,
        modifier = Modifier
            .fillMaxWidth()
            .pressFade(onClick = onClick)
            .padding(vertical = 16.dp),
    )
}
