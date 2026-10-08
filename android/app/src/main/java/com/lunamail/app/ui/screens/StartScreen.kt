package com.lunamail.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lunamail.app.data.BoxRef
import com.lunamail.app.data.MailboxRole
import com.lunamail.app.data.MessageSummary
import com.lunamail.app.ui.MailViewModel
import com.lunamail.app.ui.components.AccountAvatar
import com.lunamail.app.ui.components.LunaButton
import com.lunamail.app.ui.components.SectionHeader
import com.lunamail.app.ui.components.SenderLogo
import com.lunamail.app.ui.components.formatListDate
import com.lunamail.app.ui.components.inverseSurface
import com.lunamail.app.ui.components.pressScale
import com.lunamail.app.ui.icons.LunaIcons
import com.lunamail.app.ui.theme.Luna
import com.lunamail.app.ui.theme.LunaType
import com.lunamail.app.ui.theme.screenBackground

/** Ziele der vier Kacheln auf dem Start-Tab. */
enum class StartTile { Inbox, Flagged, Sent, Drafts }

/**
 * Start-Tab: kompakte Leiste mit „Wem schreibst du?“ und Profilbild, vier Kacheln,
 * ungelesene E-Mails als Karten, eine Aufräum-Karte und die letzten E-Mails.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StartScreen(
    vm: MailViewModel,
    onCompose: () -> Unit,
    onOpenMessage: (MessageSummary) -> Unit,
    onTile: (StartTile) -> Unit,
    onShowUnread: () -> Unit,
    onShowInbox: () -> Unit,
    onProfile: (() -> Unit)?,
    bottomInset: Dp,
) {
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val mailboxes by vm.mailboxes.collectAsStateWithLifecycle()
    val pictures by vm.pictures.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val inbox by vm.messages(BoxRef.UnifiedInbox).collectAsStateWithLifecycle()
    val unread by vm.messages(BoxRef.Unread).collectAsStateWithLifecycle()
    val flagged by vm.messages(BoxRef.Flagged).collectAsStateWithLifecycle()
    val colors = Luna.colors

    val drafts = mailboxes.values.flatten().filter { it.role == MailboxRole.DRAFTS }.sumOf { it.total }

    PullToRefreshBox(
        isRefreshing = refreshing.isNotEmpty(),
        onRefresh = { vm.refreshAll() },
        modifier = Modifier.fillMaxSize().screenBackground(),
    ) {
        LazyColumn(
            Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.statusBars),
            contentPadding = PaddingValues(bottom = bottomInset + 20.dp),
        ) {
            item(key = "top") {
                Row(
                    Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 12.dp, bottom = 20.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        Modifier
                            .weight(1f)
                            .height(44.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(colors.cell)
                            .pressScale(scale = 0.98f, onClick = onCompose)
                            .padding(start = 13.dp, end = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(LunaIcons.Search, contentDescription = null, tint = colors.label, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(9.dp))
                        Text(
                            "Wem schreibst du?",
                            style = LunaType.callout.copy(fontSize = 15.sp, fontWeight = FontWeight.SemiBold),
                            color = colors.label,
                            maxLines = 1,
                            modifier = Modifier.weight(1f),
                        )
                        Box(
                            Modifier
                                .size(34.dp)
                                .shadow(1.dp, RoundedCornerShape(8.dp))
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (colors.isSilver) colors.cellPressed else colors.background),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(LunaIcons.Plus, contentDescription = "Neue E-Mail", tint = colors.label, modifier = Modifier.size(18.dp))
                        }
                    }
                    if (onProfile != null) {
                        Spacer(Modifier.width(12.dp))
                        val me = accounts.firstOrNull()
                        Box(Modifier.pressScale(onClick = onProfile)) {
                            AccountAvatar(
                                account = me,
                                picture = me?.let { vm.pictureFile(it.id) },
                                version = me?.let { pictures[it.id] },
                                size = 40.dp,
                                radius = 20.dp,
                            )
                        }
                    }
                }
            }

            item(key = "tiles") {
                Row(
                    Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, bottom = 28.dp),
                    horizontalArrangement = Arrangement.spacedBy(9.dp),
                ) {
                    Tile("Eingang", LunaIcons.Inbox, unread.size, Modifier.weight(1f)) { onTile(StartTile.Inbox) }
                    Tile("Markiert", LunaIcons.Flag, flagged.size, Modifier.weight(1f)) { onTile(StartTile.Flagged) }
                    Tile("Gesendet", LunaIcons.Send, 0, Modifier.weight(1f)) { onTile(StartTile.Sent) }
                    Tile("Entwürfe", LunaIcons.Draft, drafts, Modifier.weight(1f)) { onTile(StartTile.Drafts) }
                }
            }

            item(key = "unreadHeader") {
                SectionHeader("Ungelesen", count = unread.size, action = "Alle ansehen", onAction = onShowUnread)
            }
            item(key = "unreadCards") {
                LazyRow(
                    contentPadding = PaddingValues(start = 18.dp, end = 18.dp, bottom = 28.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (unread.isEmpty()) {
                        item(key = "none") {
                            Column(
                                Modifier
                                    .width(272.dp)
                                    .height(164.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(colors.cell)
                                    .padding(16.dp),
                                verticalArrangement = Arrangement.Center,
                            ) {
                                Text("Alles gelesen", style = LunaType.cardTitle, color = colors.label)
                                Spacer(Modifier.height(6.dp))
                                Text("Keine ungelesenen E-Mails", style = LunaType.footnote.copy(fontWeight = FontWeight.SemiBold), color = colors.secondaryLabel)
                            }
                        }
                    }
                    items(unread.take(5), key = { it.key }) { message ->
                        val index = unread.indexOf(message)
                        UnreadCard(
                            message = message,
                            account = vm.account(message.accountId)?.description.orEmpty(),
                            strong = index == 0,
                            modifier = Modifier.animateItem(),
                        ) { onOpenMessage(message) }
                    }
                }
            }

            if (unread.isNotEmpty()) {
                item(key = "promo") {
                    PromoCard(unread.size) { vm.markSeen(unread, true) }
                }
            }

            item(key = "recentHeader") {
                SectionHeader("Zuletzt", action = "Posteingang", onAction = onShowInbox)
            }
            items(inbox.take(3), key = { "recent:" + it.key }) { message ->
                MessageRow(message, onClick = { onOpenMessage(message) }, modifier = Modifier.animateItem())
            }
        }
    }
}

@Composable
private fun Tile(label: String, icon: ImageVector, count: Int, modifier: Modifier, onClick: () -> Unit) {
    val colors = Luna.colors
    Box(
        modifier
            .aspectRatio(1f / 1.02f)
            .clip(RoundedCornerShape(10.dp))
            .background(colors.cell)
            .pressScale(scale = 0.95f, onClick = onClick),
    ) {
        Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, contentDescription = null, tint = colors.label, modifier = Modifier.size(26.dp))
            Spacer(Modifier.height(8.dp))
            Text(label, style = LunaType.footnote.copy(fontWeight = FontWeight.SemiBold), color = colors.label, maxLines = 1)
        }
        if (count > 0) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(7.dp)
                    .heightIn(min = 19.dp)
                    .inverseSurface(colors.inverseBrush, RoundedCornerShape(5.dp))
                    .padding(horizontal = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(count.toString(), style = LunaType.caption.copy(fontSize = 11.sp, fontWeight = FontWeight.Bold), color = colors.onInverse)
            }
        }
    }
}

@Composable
private fun UnreadCard(message: MessageSummary, account: String, strong: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val colors = Luna.colors
    val shape = RoundedCornerShape(12.dp)
    val content = if (strong) colors.onInverse else colors.label
    Column(
        modifier
            .width(272.dp)
            .height(164.dp)
            .then(
                if (strong) Modifier.shadow(if (colors.isSilver) 14.dp else 0.dp, shape).inverseSurface(colors.inverseBrush, shape)
                else Modifier.clip(shape).background(colors.cell)
            )
            .pressScale(scale = 0.97f, onClick = onClick)
            .padding(16.dp),
    ) {
        Row(Modifier.graphicsLayer { alpha = 0.8f }, verticalAlignment = Alignment.CenterVertically) {
            SenderLogo(message.fromAddress, message.senderLabel, size = 22.dp, radius = 6.dp)
            Spacer(Modifier.width(6.dp))
            Text(
                message.senderLabel,
                style = LunaType.footnote.copy(fontWeight = FontWeight.SemiBold),
                color = content,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            if (message.hasAttachments) {
                Spacer(Modifier.width(4.dp))
                Icon(LunaIcons.Paperclip, null, tint = content, modifier = Modifier.size(13.dp))
            }
        }
        Spacer(Modifier.height(12.dp))
        Text(
            message.subject.ifBlank { "(Kein Betreff)" },
            style = LunaType.cardTitle,
            color = content,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.weight(1f))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                listOf(account, formatListDate(message.date)).filter { it.isNotBlank() }.joinToString(" · "),
                style = LunaType.footnote.copy(fontWeight = FontWeight.SemiBold),
                color = content.copy(alpha = 0.65f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Box(
                Modifier.size(30.dp).clip(RoundedCornerShape(8.dp)).background(Color(0x2E7F7F7F)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(LunaIcons.ArrowRight, contentDescription = null, tint = content, modifier = Modifier.size(16.dp))
            }
        }
    }
}

@Composable
private fun PromoCard(count: Int, onReadAll: () -> Unit) {
    val colors = Luna.colors
    Row(
        Modifier
            .fillMaxWidth()
            .padding(start = 18.dp, end = 18.dp, bottom = 28.dp)
            .heightIn(min = 128.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(colors.cell),
    ) {
        Column(Modifier.weight(1f).padding(16.dp)) {
            Text(
                if (count == 1) "1 E-Mail ungelesen" else "$count E-Mails ungelesen",
                style = LunaType.headline.copy(fontSize = 17.sp, fontWeight = FontWeight.Bold),
                color = colors.label,
            )
            Spacer(Modifier.height(5.dp))
            Text(
                "Lies sie in Ruhe oder räum den Posteingang mit einem Tipp auf.",
                style = LunaType.footnote.copy(fontSize = 13.5.sp),
                color = colors.secondaryLabel,
            )
            Spacer(Modifier.height(12.dp))
            LunaButton("Alle gelesen", icon = LunaIcons.Check, onClick = onReadAll)
        }
        // Zwei gestapelte Briefe als kleine Illustration.
        Box(Modifier.width(118.dp).fillMaxHeight().heightIn(min = 128.dp)) {
            Box(
                Modifier
                    .offset(x = 18.dp, y = 30.dp)
                    .size(78.dp, 56.dp)
                    .rotate(-8f)
                    .shadow(8.dp, RoundedCornerShape(7.dp))
                    .clip(RoundedCornerShape(7.dp))
                    .background(if (colors.isSilver) Color(0xFF55575D) else colors.background),
            )
            Box(
                Modifier
                    .offset(x = 28.dp, y = 44.dp)
                    .size(78.dp, 56.dp)
                    .rotate(4f)
                    .shadow(8.dp, RoundedCornerShape(7.dp))
                    .inverseSurface(colors.inverseBrush, RoundedCornerShape(7.dp)),
            )
        }
    }
}
