package com.lunamail.app.ui.screens

import com.lunamail.app.ui.icons.LunaIcons
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lunamail.app.data.BoxRef
import com.lunamail.app.data.MailboxRole
import com.lunamail.app.data.MessageSummary
import com.lunamail.app.ui.MailViewModel
import com.lunamail.app.ui.components.Chip
import com.lunamail.app.ui.components.LunaButton
import com.lunamail.app.ui.components.PageTitle
import com.lunamail.app.ui.components.SearchBox
import com.lunamail.app.ui.components.SelectBox
import com.lunamail.app.ui.components.SenderLogo
import com.lunamail.app.ui.components.SquareButton
import com.lunamail.app.ui.components.SwipeAction
import com.lunamail.app.ui.components.SwipeActionsBox
import com.lunamail.app.ui.components.cellPress
import com.lunamail.app.ui.components.formatDayGroup
import com.lunamail.app.ui.components.formatListDate
import com.lunamail.app.ui.components.inverseSurface
import com.lunamail.app.ui.components.pressFade
import com.lunamail.app.ui.components.pressScale
import com.lunamail.app.ui.theme.Luna
import com.lunamail.app.ui.theme.LunaType
import com.lunamail.app.ui.theme.screenBackground

/**
 * Liste eines Postfachs. Im Posteingang-Tab gibt es oben Filter-Chips ([chips]) statt
 * eines Zurück-Knopfs; aus dem Ordner-Tab heraus kommt sie mit [onBack].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MessageListScreen(
    vm: MailViewModel,
    box: BoxRef,
    onBack: (() -> Unit)?,
    onOpen: (MessageSummary) -> Unit,
    onCompose: () -> Unit,
    onReply: (MessageSummary, ReplyKind) -> Unit,
    title: String? = null,
    chips: List<Pair<BoxRef, String>> = emptyList(),
    onSelectBox: (BoxRef) -> Unit = {},
    selectedKey: String? = null,
    /** Platz unten für die schwebende Tab-Leiste. */
    bottomInset: Dp = 0.dp,
    showFab: Boolean = true,
    onEditingChange: (Boolean) -> Unit = {},
) {
    LaunchedEffect(box) {
        vm.loadCached(box)
        vm.refresh(box)
    }
    val messages by vm.messages(box).collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val loadingMore by vm.loadingMore.collectAsStateWithLifecycle()
    val swipeArchives by vm.swipeArchives.collectAsStateWithLifecycle()
    val isRefreshing = if (box.isUnified) refreshing.any { it.endsWith("|INBOX") } else box.key in refreshing
    val role = vm.mailbox(box)?.role

    var query by rememberSaveable { mutableStateOf("") }
    val visible = remember(messages, query) {
        val q = query.trim().lowercase()
        if (q.isEmpty()) messages
        else messages.filter { m -> listOf(m.fromName, m.fromAddress, m.to, m.subject, m.preview.orEmpty()).any { it.lowercase().contains(q) } }
    }
    val groups = remember(visible) { visible.groupBy { formatDayGroup(it.date) }.toList() }

    var editing by rememberSaveable { mutableStateOf(false) }
    var selected by remember { mutableStateOf(setOf<String>()) }
    var openRow by remember { mutableStateOf<Any?>(null) }
    var actionsFor by remember { mutableStateOf<MessageSummary?>(null) }
    var moving by remember { mutableStateOf<List<MessageSummary>?>(null) }
    val selection = visible.filter { it.key in selected }

    fun setEditing(value: Boolean) {
        editing = value
        selected = emptySet()
        openRow = null
        onEditingChange(value)
    }
    BackHandler(enabled = editing) { setEditing(false) }
    LaunchedEffect(box) { if (editing) setEditing(false) }

    val listState = rememberLazyListState()
    val nearEnd by remember(listState) {
        derivedStateOf {
            val info = listState.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull()?.index ?: 0
            info.totalItemsCount > 0 && last >= info.totalItemsCount - 6
        }
    }
    LaunchedEffect(nearEnd, messages.size) {
        if (nearEnd && messages.isNotEmpty() && query.isBlank()) vm.loadMore(box)
    }

    val colors = Luna.colors
    Box(Modifier.fillMaxSize().screenBackground()) {
        Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.statusBars)) {
            if (onBack != null) {
                Row(Modifier.padding(start = 12.dp, end = 12.dp, top = 10.dp)) {
                    SquareButton(LunaIcons.ArrowLeft, "Zurück", onClick = onBack)
                }
            }
            PageTitle(
                when {
                    editing && selection.isNotEmpty() -> "${selection.size} ausgewählt"
                    editing -> "Auswählen"
                    else -> title ?: vm.title(box)
                },
            ) {
                Text(
                    if (editing) "Fertig" else "Bearbeiten",
                    style = LunaType.callout.copy(fontWeight = FontWeight.SemiBold),
                    color = colors.label,
                    modifier = Modifier.pressFade { setEditing(!editing) }.padding(vertical = 6.dp),
                )
            }
            if (chips.isNotEmpty()) {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 18.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(bottom = 12.dp),
                ) {
                    items(chips, key = { it.first.key }) { (ref, label) ->
                        Chip(label, selected = ref == box) { onSelectBox(ref) }
                    }
                }
            }
            SearchBox(query, { query = it }, Modifier.padding(start = 18.dp, end = 18.dp, bottom = 4.dp))

            PullToRefreshBox(
                isRefreshing = isRefreshing,
                onRefresh = { vm.refresh(box) },
                modifier = Modifier.weight(1f),
            ) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = bottomInset + 90.dp),
                ) {
                    if (visible.isEmpty() && !isRefreshing) {
                        item(key = "empty") {
                            Column(Modifier.fillMaxWidth().padding(horizontal = 30.dp, vertical = 70.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(
                                    if (query.isNotBlank()) "Keine Treffer" else "Alles erledigt",
                                    style = LunaType.title2.copy(fontWeight = FontWeight.Bold),
                                    color = colors.label,
                                )
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    when {
                                        query.isNotBlank() -> "Versuch es mit einem anderen Suchbegriff."
                                        box == BoxRef.Unread -> "Keine ungelesenen E-Mails."
                                        box == BoxRef.Flagged -> "Keine markierten E-Mails."
                                        else -> "Hier ist gerade nichts."
                                    },
                                    style = LunaType.subhead,
                                    color = colors.secondaryLabel,
                                    textAlign = TextAlign.Center,
                                )
                            }
                        }
                    }
                    groups.forEach { (day, dayMessages) ->
                        item(key = "day:$day") {
                            Text(
                                day,
                                style = LunaType.sectionLabel,
                                color = colors.secondaryLabel,
                                modifier = Modifier.animateItem().fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 12.dp, bottom = 4.dp),
                            )
                        }
                        items(dayMessages, key = { it.key }) { message ->
                            val archives = swipeArchives && vm.canArchive(message)
                            SwipeActionsBox(
                                key = message.key,
                                openKey = openRow,
                                onOpenChange = { openRow = it },
                                enabled = !editing,
                                leading = listOf(
                                    SwipeAction(
                                        if (message.seen) "Ungelesen" else "Gelesen",
                                        if (message.seen) LunaIcons.Mail else LunaIcons.MailOpen,
                                        colors.inverse,
                                        colors.onInverse,
                                    ) { vm.markSeen(message, !message.seen) },
                                ),
                                trailing = listOf(
                                    if (archives) {
                                        SwipeAction("Archiv", LunaIcons.Archive, colors.gray) { vm.archive(message) }
                                    } else {
                                        SwipeAction("Löschen", LunaIcons.Trash, colors.red) { vm.delete(message) }
                                    },
                                    SwipeAction(
                                        if (message.flagged) "Entfernen" else "Markieren",
                                        LunaIcons.Flag,
                                        colors.orange,
                                    ) { vm.markFlagged(message, !message.flagged) },
                                    SwipeAction("Mehr", LunaIcons.More, colors.tertiaryLabel) { actionsFor = message },
                                ),
                                modifier = Modifier.animateItem(),
                            ) {
                                MessageRow(
                                    message = message,
                                    role = role,
                                    active = message.key == selectedKey,
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
                    }
                    item(key = "bottom") {
                        Box(Modifier.fillMaxWidth().height(56.dp), contentAlignment = Alignment.Center) {
                            if (box.key in loadingMore) {
                                CircularProgressIndicator(color = colors.secondaryLabel, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                            }
                        }
                    }
                }
            }
        }

        // Neue E-Mail: quadratischer „+“-Knopf über der Tab-Leiste.
        AnimatedVisibility(
            visible = showFab && !editing,
            enter = fadeIn(tween(250)) + slideInVertically(tween(300)) { it / 2 },
            exit = fadeOut(tween(200)) + slideOutVertically(tween(300)) { it / 2 },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .windowInsetsPadding(WindowInsets.navigationBars)
                .padding(end = 16.dp, bottom = bottomInset + 16.dp),
        ) {
            Box(
                Modifier
                    .size(56.dp)
                    .shadow(16.dp, RoundedCornerShape(12.dp), clip = false)
                    .inverseSurface(colors.inverseBrush, RoundedCornerShape(12.dp))
                    .pressScale(onClick = onCompose),
                contentAlignment = Alignment.Center,
            ) {
                Icon(LunaIcons.Plus, contentDescription = "Neue E-Mail", tint = colors.onInverse, modifier = Modifier.size(26.dp))
            }
        }

        // Leiste im Bearbeiten-Modus.
        AnimatedVisibility(
            visible = editing,
            enter = slideInVertically(tween(350)) { it },
            exit = slideOutVertically(tween(300)) { it },
            modifier = Modifier.align(Alignment.BottomCenter),
        ) {
            val enabled = selection.isNotEmpty()
            val allSeen = enabled && selection.all { it.seen }
            val allFlagged = enabled && selection.all { it.flagged }
            val canArchive = enabled && selection.all { vm.canArchive(it) }
            Column(Modifier.fillMaxWidth().background(if (colors.isSilver) colors.swipeRow else colors.background)) {
                HorizontalDivider(thickness = 1.dp, color = colors.separator)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .windowInsetsPadding(WindowInsets.navigationBars)
                        .padding(start = 14.dp, end = 14.dp, top = 12.dp, bottom = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    LunaButton(if (allSeen) "Ungelesen" else "Gelesen", Modifier.weight(1f), primary = false, enabled = enabled, height = 46.dp) {
                        vm.markSeen(selection, !allSeen)
                        selected = emptySet()
                    }
                    LunaButton(if (allFlagged) "Entfernen" else "Markieren", Modifier.weight(1f), primary = false, enabled = enabled, height = 46.dp) {
                        vm.markFlagged(selection, !allFlagged)
                        selected = emptySet()
                    }
                    LunaButton("Archiv", Modifier.weight(1f), primary = false, enabled = canArchive, height = 46.dp) {
                        vm.archive(selection)
                        setEditing(false)
                    }
                    LunaButton("Löschen", Modifier.weight(1f), enabled = enabled, height = 46.dp) {
                        vm.delete(selection)
                        setEditing(false)
                    }
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
            setEditing(false)
        }
    }
}

/**
 * Zeile einer E-Mail: Logo-Kachel mit Ungelesen-Punkt, Absender, Uhrzeit und Betreff.
 * Im Gesendet-Ordner steht „An …“, bei Entwürfen „Entwurf · …“.
 */
@Composable
fun MessageRow(
    message: MessageSummary,
    onClick: () -> Unit,
    onLongClick: () -> Unit = {},
    modifier: Modifier = Modifier,
    role: MailboxRole? = null,
    active: Boolean = false,
    selecting: Boolean = false,
    selected: Boolean = false,
) {
    val colors = Luna.colors
    val unread = !message.seen
    val recipient = message.to.substringBefore(',').substringBefore('<').trim().trim('"')
    val name = when (role) {
        MailboxRole.SENT -> recipient.ifBlank { message.to }
        MailboxRole.DRAFTS -> recipient.ifBlank { "Kein Empfänger" }
        else -> message.senderLabel
    }
    val prefix = when (role) {
        MailboxRole.SENT -> "An "
        MailboxRole.DRAFTS -> "Entwurf · "
        else -> ""
    }
    val outgoing = role == MailboxRole.SENT || role == MailboxRole.DRAFTS
    val logoAddress = if (outgoing) message.to.substringBefore(',').let { it.substringAfter('<').substringBefore('>') } else message.fromAddress
    Row(
        modifier
            .fillMaxWidth()
            .then(if (active) Modifier.background(colors.cell) else Modifier)
            .cellPress(onClick, onLongClick)
            .padding(horizontal = 18.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AnimatedVisibility(
            visible = selecting,
            enter = expandHorizontally(tween(250)) + fadeIn(tween(250)),
            exit = shrinkHorizontally(tween(200)) + fadeOut(tween(150)),
        ) {
            Row {
                SelectBox(selected)
                Spacer(Modifier.width(14.dp))
            }
        }
        SenderLogo(logoAddress, name, size = 48.dp, unread = unread)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    prefix + name,
                    style = LunaType.headline.copy(fontWeight = if (unread) FontWeight.ExtraBold else FontWeight.SemiBold),
                    color = colors.label,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (message.hasAttachments) {
                    Spacer(Modifier.width(6.dp))
                    Icon(LunaIcons.Paperclip, null, tint = colors.secondaryLabel, modifier = Modifier.size(14.dp))
                }
                AnimatedVisibility(
                    visible = message.flagged,
                    enter = scaleIn(spring(dampingRatio = Spring.DampingRatioMediumBouncy)) + fadeIn(),
                    exit = scaleOut(tween(180)) + fadeOut(tween(180)),
                ) {
                    Row {
                        Spacer(Modifier.width(6.dp))
                        Icon(LunaIcons.FlagFilled, null, tint = colors.orange, modifier = Modifier.size(14.dp))
                    }
                }
                Spacer(Modifier.width(6.dp))
                val date = remember(message.date) { formatListDate(message.date) }
                Text(date, style = LunaType.footnote.copy(fontWeight = FontWeight.Medium), color = colors.secondaryLabel)
            }
            Spacer(Modifier.height(3.dp))
            Text(
                message.subject.ifBlank { "(Kein Betreff)" },
                style = LunaType.subhead.copy(fontWeight = if (unread) FontWeight.Medium else FontWeight.Normal),
                color = if (unread) colors.label else colors.secondaryLabel,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
