package com.lunamail.app.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material.icons.rounded.FilterList
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lunamail.app.data.BoxRef
import com.lunamail.app.data.MessageSummary
import com.lunamail.app.ui.MailViewModel
import com.lunamail.app.ui.components.BackButton
import com.lunamail.app.ui.components.BarIcon
import com.lunamail.app.ui.components.BottomToolbar
import com.lunamail.app.ui.components.LargeTitle
import com.lunamail.app.ui.components.NavigationBar
import com.lunamail.app.ui.components.SearchField
import com.lunamail.app.ui.components.cellPress
import com.lunamail.app.ui.components.formatListDate
import com.lunamail.app.ui.components.rememberCollapsed
import com.lunamail.app.ui.theme.Luna
import com.lunamail.app.ui.theme.LunaType

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MessageListScreen(
    vm: MailViewModel,
    box: BoxRef,
    onBack: () -> Unit,
    onOpen: (MessageSummary) -> Unit,
    onCompose: () -> Unit,
) {
    LaunchedEffect(box) {
        vm.loadCached(box)
        vm.refresh(box)
    }
    val messages by vm.messages(box).collectAsStateWithLifecycle(emptyList())
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val lastSync by vm.lastSync.collectAsStateWithLifecycle()
    val isRefreshing = if (box.isUnified) refreshing.any { it.endsWith("|INBOX") } else box.key in refreshing

    var query by rememberSaveable { mutableStateOf("") }
    var unreadOnly by rememberSaveable { mutableStateOf(false) }
    val visible = remember(messages, query, unreadOnly) {
        val q = query.trim().lowercase()
        messages.filter { m ->
            (!unreadOnly || !m.seen) &&
                (q.isEmpty() || listOf(m.fromName, m.fromAddress, m.subject, m.preview.orEmpty()).any { it.lowercase().contains(q) })
        }
    }

    val title = vm.title(box)
    val listState = rememberLazyListState()
    val collapsed = rememberCollapsed(listState)
    val background = Luna.colors.background

    Column(Modifier.fillMaxSize().background(background)) {
        NavigationBar(
            title = title,
            collapsed = collapsed,
            background = background,
            navigation = { BackButton("Postfächer", onBack) },
        )

        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = { vm.refresh(box) },
            modifier = Modifier.weight(1f),
        ) {
            LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                item(key = "title") { LargeTitle(title) }
                item(key = "search") {
                    SearchField(query, { query = it }, Modifier.padding(bottom = 8.dp))
                }
                if (visible.isEmpty() && !isRefreshing) {
                    item(key = "empty") {
                        Text(
                            when {
                                query.isNotBlank() -> "Keine Treffer"
                                unreadOnly -> "Keine ungelesenen E-Mails"
                                else -> "Keine E-Mails"
                            },
                            style = LunaType.body,
                            color = Luna.colors.secondaryLabel,
                            modifier = Modifier.fillMaxWidth().padding(top = 80.dp),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        )
                    }
                }
                items(visible, key = { it.key }) { message ->
                    SwipeableMessageRow(
                        vm = vm,
                        message = message,
                        onOpen = { onOpen(message) },
                        modifier = Modifier.animateItem(),
                    )
                }
                item(key = "bottom") { Spacer(Modifier.height(24.dp)) }
            }
        }

        val unread = messages.count { !it.seen }
        BottomToolbar {
            BarIcon(
                if (unreadOnly) Icons.Rounded.FilterList else Icons.Outlined.FilterList,
                "Nach ungelesen filtern",
                onClick = { unreadOnly = !unreadOnly },
            )
            if (unreadOnly) {
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Gefiltert nach:", style = LunaType.caption, color = Luna.colors.label)
                    Text("Ungelesen", style = LunaType.caption, color = Luna.colors.accent)
                }
            } else {
                SyncStatus(
                    refreshing = isRefreshing,
                    lastSync = lastSync,
                    subtitle = if (unread > 0) "$unread ungelesen" else null,
                    modifier = Modifier.weight(1f),
                )
            }
            BarIcon(Icons.Outlined.EditNote, "Neue E-Mail", onClick = onCompose)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeableMessageRow(vm: MailViewModel, message: MessageSummary, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val canArchive = remember(message) { vm.canArchive(message) }
    val inTrash = remember(message) { vm.isInTrash(message) }
    // Schutz gegen doppelte Auslösung, falls die Geste mehrfach bestätigt wird.
    val handled = remember { booleanArrayOf(false) }
    val state = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value != SwipeToDismissBoxValue.Settled && !handled[0]) {
                handled[0] = true
                if (value == SwipeToDismissBoxValue.StartToEnd) vm.archive(message) else vm.delete(message)
            }
            true
        },
        positionalThreshold = { distance -> distance * 0.4f },
    )
    var menu by remember { mutableStateOf(false) }

    SwipeToDismissBox(
        state = state,
        modifier = modifier,
        enableDismissFromStartToEnd = canArchive,
        backgroundContent = {
            val direction = state.dismissDirection
            val armed = state.targetValue != SwipeToDismissBoxValue.Settled
            val scale by animateFloatAsState(if (armed) 1.15f else 0.9f, label = "swipeIcon")
            when (direction) {
                SwipeToDismissBoxValue.StartToEnd -> SwipeBackground(
                    color = Luna.colors.purple,
                    icon = Icons.Outlined.Archive,
                    label = "Archivieren",
                    alignment = Alignment.CenterStart,
                    iconScale = scale,
                )
                SwipeToDismissBoxValue.EndToStart -> SwipeBackground(
                    color = Luna.colors.red,
                    icon = Icons.Outlined.Delete,
                    label = if (inTrash) "Löschen" else "Papierkorb",
                    alignment = Alignment.CenterEnd,
                    iconScale = scale,
                )
                SwipeToDismissBoxValue.Settled -> Unit
            }
        },
    ) {
        Box {
            MessageRow(message, onClick = onOpen, onLongClick = { menu = true })
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(
                    text = { Text(if (message.seen) "Als ungelesen markieren" else "Als gelesen markieren") },
                    onClick = { menu = false; vm.setSeen(message, !message.seen) },
                )
                DropdownMenuItem(
                    text = { Text(if (message.flagged) "Markierung entfernen" else "Markieren") },
                    onClick = { menu = false; vm.setFlagged(message, !message.flagged) },
                )
                if (canArchive) {
                    DropdownMenuItem(text = { Text("Archivieren") }, onClick = { menu = false; vm.archive(message) })
                }
                DropdownMenuItem(
                    text = { Text("Löschen", color = Luna.colors.red) },
                    onClick = { menu = false; vm.delete(message) },
                )
            }
        }
    }
}

@Composable
private fun SwipeBackground(color: Color, icon: ImageVector, label: String, alignment: Alignment, iconScale: Float) {
    Box(Modifier.fillMaxSize().background(color).padding(horizontal = 24.dp), contentAlignment = alignment) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.scale(iconScale)) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
            Text(label, style = LunaType.caption, color = Color.White)
        }
    }
}

@Composable
fun MessageRow(message: MessageSummary, onClick: () -> Unit, onLongClick: () -> Unit) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(Luna.colors.background)
            .cellPress(onClick, onLongClick),
    ) {
        Row(Modifier.fillMaxWidth().padding(top = 10.dp, end = 12.dp)) {
            Box(Modifier.width(30.dp).padding(top = 6.dp), contentAlignment = Alignment.TopCenter) {
                if (!message.seen) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(Luna.colors.accent))
                }
            }
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        message.senderLabel,
                        style = LunaType.headline,
                        color = Luna.colors.label,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    if (message.hasAttachments) {
                        Icon(Icons.Rounded.AttachFile, null, tint = Luna.colors.secondaryLabel, modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(4.dp))
                    }
                    if (message.flagged) {
                        Icon(Icons.Rounded.Flag, null, tint = Luna.colors.orange, modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(4.dp))
                    }
                    Text(formatListDate(message.date), style = LunaType.subhead, color = Luna.colors.secondaryLabel)
                    Icon(
                        Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                        null,
                        tint = Luna.colors.tertiaryLabel,
                        modifier = Modifier.size(20.dp),
                    )
                }
                Text(
                    message.subject.ifBlank { "(Kein Betreff)" },
                    style = LunaType.subhead.copy(fontWeight = if (message.seen) FontWeight.Normal else FontWeight.Medium),
                    color = Luna.colors.label,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    message.preview ?: " ",
                    style = LunaType.subhead,
                    color = Luna.colors.secondaryLabel,
                    maxLines = 2,
                    minLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(10.dp))
                HorizontalDivider(thickness = 0.5.dp, color = Luna.colors.separator)
            }
        }
    }
}
