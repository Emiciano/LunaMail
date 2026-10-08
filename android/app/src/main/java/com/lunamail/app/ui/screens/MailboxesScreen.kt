package com.lunamail.app.ui.screens

import com.lunamail.app.ui.icons.LunaIcons
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lunamail.app.R
import com.lunamail.app.data.BoxRef
import com.lunamail.app.data.MailboxRole
import com.lunamail.app.ui.MailViewModel
import com.lunamail.app.ui.components.AccountAvatar
import com.lunamail.app.ui.components.AccountDropdown
import com.lunamail.app.ui.components.FolderRow
import com.lunamail.app.ui.components.LunaButton
import com.lunamail.app.ui.components.PageTitle
import com.lunamail.app.ui.theme.Luna
import com.lunamail.app.ui.theme.LunaType
import com.lunamail.app.ui.theme.screenBackground

fun MailboxRole.icon(): ImageVector = when (this) {
    MailboxRole.INBOX -> LunaIcons.Inbox
    MailboxRole.DRAFTS -> LunaIcons.Draft
    MailboxRole.SENT -> LunaIcons.Send
    MailboxRole.ARCHIVE -> LunaIcons.Archive
    MailboxRole.ALL -> LunaIcons.Inboxes
    MailboxRole.JUNK -> LunaIcons.Spam
    MailboxRole.TRASH -> LunaIcons.Trash
    MailboxRole.OTHER -> LunaIcons.Folder
}

/** Öffnet die Fotoauswahl und setzt das gewählte Bild als Kontobild. */
@Composable
fun rememberPicturePicker(vm: MailViewModel): (String) -> Unit {
    var target by remember { mutableStateOf<String?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        val id = target
        if (uri != null && id != null) vm.setAccountPicture(id, uri)
        target = null
    }
    return { accountId ->
        target = accountId
        launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }
}

/** Ordner-Tab: pro Konto eine aufklappbare Karte mit Kontobild und den Ordnern. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoldersScreen(
    vm: MailViewModel,
    onOpen: (BoxRef) -> Unit,
    selected: BoxRef? = null,
    bottomInset: Dp,
) {
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val mailboxes by vm.mailboxes.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val expandedAccounts by vm.expandedAccounts.collectAsStateWithLifecycle()
    val pictures by vm.pictures.collectAsStateWithLifecycle()
    // Die Ungelesen-Zähler hängen von den geladenen Nachrichten ab.
    vm.allMessages.collectAsStateWithLifecycle().value
    val pickPicture = rememberPicturePicker(vm)

    PullToRefreshBox(
        isRefreshing = refreshing.isNotEmpty(),
        onRefresh = { vm.refreshAll() },
        modifier = Modifier.fillMaxSize().screenBackground(),
    ) {
        LazyColumn(
            Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.statusBars),
            contentPadding = PaddingValues(top = 8.dp, bottom = bottomInset + 20.dp),
        ) {
            item(key = "title") { PageTitle("Ordner") }
            accounts.forEachIndexed { index, account ->
                val inbox = BoxRef(account.id, "INBOX")
                val boxes = mailboxes[account.id].orEmpty().filter { it.role != MailboxRole.INBOX }
                // Das erste Konto ist anfangs offen, weitere zu, damit es übersichtlich bleibt.
                val expanded = expandedAccounts?.contains(account.id) ?: (index == 0)
                item(key = account.id) {
                    AccountDropdown(
                        email = account.email,
                        name = account.description,
                        unread = vm.unreadCount(inbox),
                        expanded = expanded,
                        onToggle = { vm.toggleAccountExpanded(account.id, expanded) },
                        modifier = Modifier.padding(bottom = 12.dp),
                        avatar = {
                            AccountAvatar(
                                account = account,
                                picture = vm.pictureFile(account.id),
                                version = pictures[account.id],
                                size = 44.dp,
                                onEdit = { pickPicture(account.id) },
                            )
                        },
                    ) {
                        FolderRow(
                            title = "Eingang",
                            icon = LunaIcons.Inbox,
                            count = vm.unreadCount(inbox).takeIf { it > 0 }?.toString(),
                            selected = selected == inbox,
                            onClick = { onOpen(inbox) },
                        )
                        if (boxes.isEmpty() && refreshing.isNotEmpty()) {
                            Text(
                                "Ordner werden geladen …",
                                style = LunaType.subhead,
                                color = Luna.colors.secondaryLabel,
                                modifier = Modifier.padding(vertical = 14.dp),
                            )
                        }
                        boxes.forEach { box ->
                            val count = when (box.role) {
                                MailboxRole.DRAFTS -> box.total
                                MailboxRole.JUNK, MailboxRole.OTHER, MailboxRole.ARCHIVE -> box.unread
                                else -> 0
                            }
                            FolderRow(
                                title = box.displayName,
                                icon = box.role.icon(),
                                count = count.takeIf { it > 0 }?.toString(),
                                selected = selected == box.ref,
                                onClick = { onOpen(box.ref) },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun Welcome(onAddAccount: () -> Unit) {
    Column(
        Modifier.fillMaxSize().screenBackground().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Image(
            painterResource(R.mipmap.ic_launcher_foreground),
            contentDescription = null,
            modifier = Modifier.size(132.dp).clip(RoundedCornerShape(30.dp)).background(Luna.colors.cell),
        )
        Spacer(Modifier.height(24.dp))
        Text("Willkommen bei LunaMail", style = LunaType.title2, color = Luna.colors.label, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(
            "Füge ein E-Mail-Konto hinzu, um deine Postfächer zu sehen.",
            style = LunaType.body,
            color = Luna.colors.secondaryLabel,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        LunaButton("Konto hinzufügen", Modifier.fillMaxWidth(), height = 52.dp, onClick = onAddAccount)
    }
}
