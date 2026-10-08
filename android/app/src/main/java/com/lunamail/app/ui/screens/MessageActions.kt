package com.lunamail.app.ui.screens

import com.lunamail.app.ui.icons.LunaIcons
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lunamail.app.data.Mailbox
import com.lunamail.app.data.MailboxRole
import com.lunamail.app.data.MessageSummary
import com.lunamail.app.ui.MailViewModel
import com.lunamail.app.ui.components.SenderLogo
import com.lunamail.app.ui.components.CellRow
import com.lunamail.app.ui.theme.Luna
import com.lunamail.app.ui.theme.LunaType

enum class ReplyKind { Reply, ReplyAll, Forward }

/** Aktionsblatt wie „Mehr“ in Apple Mail. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MessageActionsSheet(
    vm: MailViewModel,
    message: MessageSummary,
    onDismiss: () -> Unit,
    onReply: (ReplyKind) -> Unit,
    onMove: () -> Unit,
    /** Wird nach Aktionen aufgerufen, die die Nachricht aus dem Postfach entfernen. */
    onRemoved: () -> Unit = {},
    showReplies: Boolean = true,
) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        containerColor = Luna.colors.groupedBackground,
    ) {
        Column(Modifier.navigationBarsPadding().verticalScroll(rememberScrollState())) {
            Row(Modifier.padding(horizontal = 20.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                SenderLogo(message.fromAddress, message.senderLabel, size = 40.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(message.senderLabel, style = LunaType.headline, color = Luna.colors.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        message.subject.ifBlank { "(Kein Betreff)" },
                        style = LunaType.subhead,
                        color = Luna.colors.secondaryLabel,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            if (showReplies) {
                SheetGroup {
                    CellRow("Antworten", icon = LunaIcons.Reply, showChevron = false) { onDismiss(); onReply(ReplyKind.Reply) }
                    CellRow("Allen antworten", icon = LunaIcons.ReplyAll, showChevron = false) { onDismiss(); onReply(ReplyKind.ReplyAll) }
                    CellRow("Weiterleiten", icon = LunaIcons.Forward, showChevron = false, showDivider = false) { onDismiss(); onReply(ReplyKind.Forward) }
                }
            }
            SheetGroup {
                CellRow(
                    if (message.flagged) "Markierung entfernen" else "Markieren",
                    icon = LunaIcons.Flag,
                    iconTint = Luna.colors.orange,
                    showChevron = false,
                ) { onDismiss(); vm.markFlagged(message, !message.flagged) }
                CellRow(
                    if (message.seen) "Als ungelesen markieren" else "Als gelesen markieren",
                    icon = if (message.seen) LunaIcons.MailUnread else LunaIcons.MailOpen,
                    showChevron = false,
                ) { onDismiss(); vm.markSeen(message, !message.seen) }
                CellRow("E-Mail bewegen …", icon = LunaIcons.Move, showChevron = false, showDivider = vm.canArchive(message)) {
                    onDismiss(); onMove()
                }
                if (vm.canArchive(message)) {
                    CellRow("Archivieren", icon = LunaIcons.Archive, showChevron = false, showDivider = false) {
                        onDismiss(); vm.archive(message); onRemoved()
                    }
                }
            }
            SheetGroup {
                CellRow(
                    if (vm.isInTrash(message)) "Endgültig löschen" else "In den Papierkorb",
                    icon = LunaIcons.Trash,
                    iconTint = Luna.colors.red,
                    titleColor = Luna.colors.red,
                    showChevron = false,
                    showDivider = false,
                ) { onDismiss(); vm.delete(message); onRemoved() }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

/** Auswahl des Zielpostfachs, wie „Bewegen“ in Apple Mail. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MoveSheet(vm: MailViewModel, accountId: String, currentFolder: String?, onDismiss: () -> Unit, onPick: (Mailbox) -> Unit) {
    val mailboxes by vm.mailboxes.collectAsStateWithLifecycle()
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = state, containerColor = Luna.colors.groupedBackground) {
        Text(
            "Bewegen nach",
            style = LunaType.headline,
            color = Luna.colors.label,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
        )
        val targets = mailboxes[accountId].orEmpty().filter { it.fullName != currentFolder && it.role != MailboxRole.DRAFTS }
        Column(Modifier.navigationBarsPadding().verticalScroll(rememberScrollState())) {
            SheetGroup {
                targets.forEachIndexed { index, target ->
                    CellRow(
                        title = target.displayName,
                        icon = target.role.icon(),
                        showChevron = false,
                        showDivider = index < targets.lastIndex,
                    ) {
                        onDismiss()
                        onPick(target)
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun SheetGroup(content: @Composable () -> Unit) {
    Column(
        Modifier
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Luna.colors.cell),
    ) { content() }
}
