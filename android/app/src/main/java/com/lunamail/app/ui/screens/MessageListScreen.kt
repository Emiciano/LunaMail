package com.lunamail.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material.icons.outlined.EditNote
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material.icons.rounded.Archive
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.FilterList
import androidx.compose.material.icons.rounded.Flag
import androidx.compose.material.icons.rounded.MarkEmailRead
import androidx.compose.material.icons.rounded.MarkEmailUnread
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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
import com.lunamail.app.ui.components.SwipeAction
import com.lunamail.app.ui.components.SwipeActionsBox
import com.lunamail.app.ui.components.TextAction
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
    onReply: (MessageSummary, ReplyKind) -> Unit,
) {
    LaunchedEffect(box) {
        vm.loadCached(box)
        vm.refresh(box)
    }
    val messages by vm.messages(box).collectAsStateWithLifecycle(emptyList())
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val loadingMore by vm.loadingMore.collectAsStateWithLifecycle()
    val lastSync by vm.lastSync.collectAsStateWithLifecycle()
    val swipeArchives by vm.swipeArchives.collectAsStateWithLifecycle()
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

    var editing by rememberSaveable { mutableStateOf(false) }
    var selected by remember { mutableStateOf(setOf<String>()) }
    var openRow by remember { mutableStateOf<Any?>(null) }
    var actionsFor by remember { mutableStateOf<MessageSummary?>(null) }
    var moving by remember { mutableStateOf<List<MessageSummary>?>(null) }
    var markMenu by remember { mutableStateOf(false) }
    val selection = visible.filter { it.key in selected }

    fun endEditing() {
        editing = false
        selected = emptySet()
    }
    BackHandler(enabled = editing) { endEditing() }

    val title = when {
        editing && selection.isNotEmpty() -> "${selection.size} ausgewählt"
        else -> vm.title(box)
    }
    val listState = rememberLazyListState()
    val collapsed = rememberCollapsed(listState)
    val background = Luna.colors.background

    // Ältere E-Mails nachladen, sobald das Listenende in Sicht kommt.
    val nearEnd by remember(listState) {
        derivedStateOf {
            val info = listState.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull()?.index ?: 0
            info.totalItemsCount > 0 && last >= info.totalItemsCount - 6
        }
    }
    LaunchedEffect(nearEnd, messages.size) {
        if (nearEnd && messages.isNotEmpty() && query.isBlank() && !unreadOnly) vm.loadMore(box)
    }

    Column(Modifier.fillMaxSize().background(background)) {
        NavigationBar(
            title = title,
            collapsed = collapsed || editing,
            background = background,
            navigation = {
                if (editing) {
                    TextAction(if (selection.size == visible.size && visible.isNotEmpty()) "Keine auswählen" else "Alle auswählen") {
                        selected = if (selection.size == visible.size) emptySet() else visible.map { it.key }.toSet()
                    }
                } else {
                    BackButton("Postfächer", onBack)
                }
            },
            actions = {
                TextAction(if (editing) "Fertig" else "Bearbeiten", bold = editing) {
                    if (editing) endEditing() else {
                        openRow = null
                        editing = true
                    }
                }
            },
        )

        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = { vm.refresh(box) },
            modifier = Modifier.weight(1f),
        ) {
            LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                item(key = "title") { LargeTitle(vm.title(box)) }
                item(key = "search") {
                    SearchField(query, { query = it }, Modifier.padding(bottom = 8.dp))
                }
                if (visible.isEmpty() && !isRefreshing) {
                    item(key = "empty") {
                        Text(
                            when {
                                query.isNotBlank() -> "Keine Treffer"
                                unreadOnly || box == BoxRef.Unread -> "Keine ungelesenen E-Mails"
                                box == BoxRef.Flagged -> "Keine markierten E-Mails"
                                else -> "Keine E-Mails"
                            },
                            style = LunaType.body,
                            color = Luna.colors.secondaryLabel,
                            modifier = Modifier.fillMaxWidth().padding(top = 80.dp),
                            textAlign = TextAlign.Center,
                        )
                    }
                }
                items(visible, key = { it.key }) { message ->
                    val archives = swipeArchives && vm.canArchive(message)
                    SwipeActionsBox(
                        key = message.key,
                        openKey = openRow,
                        onOpenChange = { openRow = it },
                        enabled = !editing,
                        leading = listOf(
                            SwipeAction(
                                if (message.seen) "Ungelesen" else "Gelesen",
                                if (message.seen) Icons.Rounded.MarkEmailUnread else Icons.Rounded.MarkEmailRead,
                                Luna.colors.accent,
                            ) { vm.setSeen(message, !message.seen) },
                        ),
                        trailing = listOf(
                            if (archives) {
                                SwipeAction("Archivieren", Icons.Rounded.Archive, Luna.colors.purple) { vm.archive(message) }
                            } else {
                                SwipeAction(if (vm.isInTrash(message)) "Löschen" else "Papierkorb", Icons.Rounded.Delete, Luna.colors.red) {
                                    vm.delete(message)
                                }
                            },
                            SwipeAction(
                                if (message.flagged) "Entfernen" else "Markieren",
                                Icons.Rounded.Flag,
                                Luna.colors.orange,
                            ) { vm.setFlagged(message, !message.flagged) },
                            SwipeAction("Mehr", Icons.Rounded.MoreHoriz, MoreGray) { actionsFor = message },
                        ),
                        modifier = Modifier.animateItem(),
                    ) {
                        MessageRow(
                            message = message,
                            selecting = editing,
                            selected = message.key in selected,
                            onClick = {
                                if (editing) {
                                    selected = if (message.key in selected) selected - message.key else selected + message.key
                                } else {
                                    onOpen(message)
                                }
                            },
                            onLongClick = { if (!editing) actionsFor = message },
                        )
                    }
                }
                item(key = "bottom") {
                    Box(Modifier.fillMaxWidth().height(56.dp), contentAlignment = Alignment.Center) {
                        if (box.key in loadingMore) {
                            CircularProgressIndicator(color = Luna.colors.secondaryLabel, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                        }
                    }
                }
            }
        }

        AnimatedContent(
            targetState = editing,
            transitionSpec = { fadeIn(tween(200)) togetherWith fadeOut(tween(150)) },
            label = "toolbar",
        ) { isEditing ->
            if (isEditing) {
                val enabled = selection.isNotEmpty()
                BottomToolbar {
                    Box {
                        TextAction("Markieren", enabled = enabled) { markMenu = true }
                        DropdownMenu(expanded = markMenu, onDismissRequest = { markMenu = false }) {
                            val allFlagged = selection.all { it.flagged }
                            val allSeen = selection.all { it.seen }
                            DropdownMenuItem(
                                text = { Text(if (allFlagged) "Markierung entfernen" else "Markieren") },
                                onClick = { markMenu = false; vm.setFlagged(selection, !allFlagged); endEditing() },
                            )
                            DropdownMenuItem(
                                text = { Text(if (allSeen) "Als ungelesen markieren" else "Als gelesen markieren") },
                                onClick = { markMenu = false; vm.setSeen(selection, !allSeen); endEditing() },
                            )
                        }
                    }
                    TextAction("Bewegen", enabled = enabled && selection.map { it.accountId }.distinct().size == 1) {
                        moving = selection
                    }
                    if (swipeArchives && selection.isNotEmpty() && selection.all { vm.canArchive(it) }) {
                        TextAction("Archivieren", enabled = enabled) { vm.archive(selection); endEditing() }
                    } else {
                        TextAction(if (selection.isNotEmpty() && selection.all { vm.isInTrash(it) }) "Löschen" else "Papierkorb", enabled = enabled) {
                            vm.delete(selection)
                            endEditing()
                        }
                    }
                }
            } else {
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
    }

    actionsFor?.let { message ->
        MessageActionsSheet(
            vm = vm,
            message = message,
            onDismiss = { actionsFor = null },
            onReply = { kind -> onReply(message, kind) },
            onMove = { moving = listOf(message) },
        )
    }

    moving?.let { list ->
        MoveSheet(
            vm = vm,
            accountId = list.first().accountId,
            currentFolder = list.map { it.folder }.distinct().singleOrNull(),
            onDismiss = { moving = null },
        ) { target ->
            vm.moveTo(list, target)
            endEditing()
        }
    }
}

private val MoreGray = Color(0xFF8E8E93)

@Composable
fun MessageRow(
    message: MessageSummary,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    selecting: Boolean = false,
    selected: Boolean = false,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(Luna.colors.background)
            .cellPress(onClick, onLongClick),
    ) {
        // Auswahlkreis wie im Bearbeiten-Modus von Apple Mail; er schiebt die Zeile nach rechts.
        AnimatedVisibility(
            visible = selecting,
            enter = expandHorizontally(tween(250)) + fadeIn(tween(250)),
            exit = shrinkHorizontally(tween(200)) + fadeOut(tween(150)),
        ) {
            Box(Modifier.padding(start = 14.dp, top = 30.dp).size(24.dp)) {
                val fill by animateColorAsState(if (selected) Luna.colors.accent else Color.Transparent, label = "check")
                Box(
                    Modifier
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(fill)
                        .border(1.5.dp, if (selected) Luna.colors.accent else Luna.colors.tertiaryLabel, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    if (selected) Icon(Icons.Rounded.Check, null, tint = Color.White, modifier = Modifier.size(16.dp))
                }
            }
        }
        Row(Modifier.weight(1f).padding(top = 10.dp, end = 12.dp)) {
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
