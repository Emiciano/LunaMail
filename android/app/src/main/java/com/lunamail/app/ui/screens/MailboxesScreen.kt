package com.lunamail.app.ui.screens

import com.lunamail.app.ui.icons.LunaIcons
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lunamail.app.R
import com.lunamail.app.data.BoxRef
import com.lunamail.app.data.MailboxRole
import com.lunamail.app.ui.MailViewModel
import com.lunamail.app.ui.components.AccountDropdown
import com.lunamail.app.ui.components.BarIcon
import com.lunamail.app.ui.components.BottomToolbar
import com.lunamail.app.ui.components.CellRow
import com.lunamail.app.ui.components.GroupedSection
import com.lunamail.app.ui.components.LargeTitle
import com.lunamail.app.ui.components.NavigationBar
import com.lunamail.app.ui.components.PrimaryButton
import com.lunamail.app.ui.components.formatTime
import com.lunamail.app.ui.components.rememberCollapsed
import com.lunamail.app.ui.theme.Luna
import com.lunamail.app.ui.theme.LunaType

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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MailboxesScreen(
    vm: MailViewModel,
    onOpen: (BoxRef) -> Unit,
    onCompose: () -> Unit,
    onSettings: () -> Unit,
    onAddAccount: () -> Unit,
) {
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val mailboxes by vm.mailboxes.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val lastSync by vm.lastSync.collectAsStateWithLifecycle()
    val expandedAccounts by vm.expandedAccounts.collectAsStateWithLifecycle()
    // Die ungelesen-Zähler hängen von den geladenen Nachrichten ab.
    val unified by vm.messages(BoxRef.UnifiedInbox).collectAsStateWithLifecycle()
    val flagged by vm.messages(BoxRef.Flagged).collectAsStateWithLifecycle()
    val listState = rememberLazyListState()
    val collapsed = rememberCollapsed(listState)
    val background = Luna.colors.groupedBackground

    Column(Modifier.fillMaxSize().background(background)) {
        NavigationBar(
            title = "Postfächer",
            collapsed = collapsed,
            background = background,
            actions = {
                if (accounts.isNotEmpty()) BarIcon(LunaIcons.Settings, "Einstellungen", onClick = onSettings)
            },
        )

        if (accounts.isEmpty()) {
            Welcome(onAddAccount)
            return@Column
        }

        PullToRefreshBox(
            isRefreshing = refreshing.isNotEmpty(),
            onRefresh = { vm.refreshAll() },
            modifier = Modifier.weight(1f),
        ) {
            LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                item { LargeTitle("Postfächer") }

                item {
                    GroupedSection {
                        if (accounts.size > 1) {
                            CellRow(
                                title = "Alle Eingänge",
                                icon = LunaIcons.Inboxes,
                                value = unified.count { !it.seen }.takeIf { it > 0 }?.toString(),
                                onClick = { onOpen(BoxRef.UnifiedInbox) },
                            )
                        }
                        // Intelligente Postfächer wie in Apple Mail.
                        CellRow(
                            title = "Markiert",
                            icon = LunaIcons.Flag,
                            iconTint = Luna.colors.orange,
                            value = flagged.size.takeIf { it > 0 }?.toString(),
                            onClick = { onOpen(BoxRef.Flagged) },
                        )
                        CellRow(
                            title = "Ungelesen",
                            icon = LunaIcons.MailUnread,
                            value = unified.count { !it.seen }.takeIf { it > 0 }?.toString(),
                            showDivider = false,
                            onClick = { onOpen(BoxRef.Unread) },
                        )
                    }
                }

                item {
                    Text(
                        if (accounts.size > 1) "KONTEN" else "KONTO",
                        style = LunaType.sectionLabel,
                        color = Luna.colors.tertiaryLabel,
                        modifier = Modifier.padding(start = 20.dp, top = 24.dp, bottom = 8.dp),
                    )
                }

                accounts.forEach { account ->
                    val inbox = BoxRef(account.id, "INBOX")
                    val boxes = mailboxes[account.id].orEmpty().filter { it.role != MailboxRole.INBOX }
                    // Mit nur einem Konto ist es anfangs offen, bei mehreren zu, damit es übersichtlich bleibt.
                    val expanded = expandedAccounts?.contains(account.id) ?: (accounts.size == 1)
                    item(key = account.id) {
                        AccountDropdown(
                            email = account.email,
                            name = account.description,
                            unread = vm.unreadCount(inbox),
                            expanded = expanded,
                            onToggle = { vm.toggleAccountExpanded(account.id, expanded) },
                            modifier = Modifier.padding(bottom = 8.dp),
                        ) {
                            CellRow(
                                title = "Eingang",
                                icon = LunaIcons.Inbox,
                                value = vm.unreadCount(inbox).takeIf { it > 0 }?.toString(),
                                showDivider = boxes.isNotEmpty(),
                                onClick = { onOpen(inbox) },
                            )
                            if (boxes.isEmpty() && refreshing.isNotEmpty()) {
                                CellRow(
                                    title = "Wird geladen …",
                                    titleColor = Luna.colors.secondaryLabel,
                                    showChevron = false,
                                    showDivider = false,
                                    onClick = {},
                                )
                            }
                            boxes.forEachIndexed { index, box ->
                                val count = when (box.role) {
                                    MailboxRole.DRAFTS -> box.total
                                    MailboxRole.JUNK, MailboxRole.OTHER, MailboxRole.ARCHIVE -> box.unread
                                    else -> 0
                                }
                                CellRow(
                                    title = box.displayName,
                                    icon = box.role.icon(),
                                    value = count.takeIf { it > 0 }?.toString(),
                                    showDivider = index < boxes.lastIndex,
                                    onClick = { onOpen(box.ref) },
                                )
                            }
                        }
                    }
                }

                item { Spacer(Modifier.height(32.dp)) }
            }
        }

        BottomToolbar {
            Spacer(Modifier.size(44.dp))
            SyncStatus(refreshing = refreshing.isNotEmpty(), lastSync = lastSync, modifier = Modifier.weight(1f))
            BarIcon(LunaIcons.Compose, "Neue E-Mail", onClick = onCompose)
        }
    }
}

@Composable
fun SyncStatus(refreshing: Boolean, lastSync: Long?, modifier: Modifier = Modifier, subtitle: String? = null) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        val text = when {
            refreshing -> "Suche nach E-Mails …"
            lastSync == null -> "Nicht aktualisiert"
            System.currentTimeMillis() - lastSync < 60_000 -> "Gerade aktualisiert"
            else -> "Aktualisiert um ${formatTime(lastSync)}"
        }
        Text(text, style = LunaType.caption, color = Luna.colors.label, maxLines = 1)
        if (subtitle != null) {
            Text(subtitle, style = LunaType.caption, color = Luna.colors.secondaryLabel, maxLines = 1)
        }
    }
}

@Composable
private fun Welcome(onAddAccount: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
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
        PrimaryButton("Account hinzufügen", onClick = onAddAccount)
    }
}
