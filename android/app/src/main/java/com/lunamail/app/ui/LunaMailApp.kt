package com.lunamail.app.ui

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.Crossfade
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavBackStackEntry
import androidx.navigation.NavController
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.lunamail.app.data.AccountConfig
import com.lunamail.app.data.BoxRef
import com.lunamail.app.data.MailboxRole
import com.lunamail.app.data.MessageBody
import com.lunamail.app.data.MessageSummary
import com.lunamail.app.ui.components.ActionIsland
import com.lunamail.app.ui.components.IslandMessage
import com.lunamail.app.ui.components.inverseSurface
import com.lunamail.app.ui.components.pressFade
import com.lunamail.app.ui.components.pressScale
import com.lunamail.app.ui.icons.LunaIcons
import com.lunamail.app.ui.screens.AccountFormScreen
import com.lunamail.app.ui.screens.AccountTabScreen
import com.lunamail.app.ui.screens.ComposeRequest
import com.lunamail.app.ui.screens.ComposeScreen
import com.lunamail.app.ui.screens.FoldersScreen
import com.lunamail.app.ui.screens.MessageListScreen
import com.lunamail.app.ui.screens.MessageScreen
import com.lunamail.app.ui.screens.ProviderPickerScreen
import com.lunamail.app.ui.screens.ReplyKind
import com.lunamail.app.ui.screens.StartScreen
import com.lunamail.app.ui.screens.StartTile
import com.lunamail.app.ui.screens.Welcome
import com.lunamail.app.ui.theme.Luna
import com.lunamail.app.ui.theme.LunaMailTheme
import com.lunamail.app.ui.theme.LunaType
import com.lunamail.app.ui.theme.SilverPhaseProvider
import com.lunamail.app.ui.theme.ThemeMode
import com.lunamail.app.ui.theme.screenBackground
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** Kurve der iOS-Push-Animation (UINavigationController). */
private val IosEasing = CubicBezierEasing(0.2f, 0.9f, 0.25f, 1f)
private const val PUSH_MS = 420

private fun push(): AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition = {
    slideInHorizontally(tween(PUSH_MS, easing = IosEasing)) { it }
}
private fun pushExit(): AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition = {
    slideOutHorizontally(tween(PUSH_MS, easing = IosEasing)) { -it / 4 } + fadeOut(tween(PUSH_MS), targetAlpha = 0.6f)
}
private fun popEnter(): AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition = {
    slideInHorizontally(tween(PUSH_MS, easing = IosEasing)) { -it / 4 } + fadeIn(tween(PUSH_MS), initialAlpha = 0.6f)
}
private fun popExit(): AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition = {
    slideOutHorizontally(tween(PUSH_MS, easing = IosEasing)) { it }
}

private fun NavGraphBuilder.screen(route: String, content: @Composable (NavBackStackEntry) -> Unit) =
    composable(
        route,
        enterTransition = push(),
        exitTransition = pushExit(),
        popEnterTransition = popEnter(),
        popExitTransition = popExit(),
    ) { content(it) }

private fun NavGraphBuilder.sheet(route: String, content: @Composable (NavBackStackEntry) -> Unit) =
    composable(
        route,
        enterTransition = { slideInVertically(tween(480, easing = CubicBezierEasing(0.32f, 0.72f, 0f, 1f))) { it } },
        exitTransition = { fadeOut(tween(PUSH_MS), targetAlpha = 0.8f) },
        popEnterTransition = { fadeIn(tween(PUSH_MS), initialAlpha = 0.8f) },
        popExitTransition = { slideOutVertically(tween(PUSH_MS, easing = IosEasing)) { it } },
    ) { content(it) }

/** Verhindert doppeltes Zurückgehen, wenn während einer Animation zweimal getippt wird. */
private fun NavController.back(entry: NavBackStackEntry) {
    if (entry.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) popBackStack()
}

private fun enc(value: String) = Uri.encode(value)

/** Die vier Tabs unten (zugeklappt) bzw. links in der Leiste (aufgeklappt). */
enum class Tab(val label: String, val icon: ImageVector) {
    Start("Start", LunaIcons.Home),
    Inbox("Posteingang", LunaIcons.Inbox),
    Folders("Ordner", LunaIcons.Folder),
    Account("Konto", LunaIcons.User),
}

private fun boxOf(key: String) = BoxRef(key.substringBefore('|'), key.substringAfter('|'))

@Composable
fun LunaMailApp(mailtoRequests: StateFlow<ComposeRequest?>, onMailtoHandled: () -> Unit) {
    val vm: MailViewModel = viewModel()
    val theme by vm.theme.collectAsStateWithLifecycle()
    LunaMailTheme(theme) {
        SilverPhaseProvider(active = theme == ThemeMode.Silver) {
            LunaMailContent(vm, mailtoRequests, onMailtoHandled)
        }
    }
}

@Composable
private fun LunaMailContent(vm: MailViewModel, mailtoRequests: StateFlow<ComposeRequest?>, onMailtoHandled: () -> Unit) {
    val nav = rememberNavController()
    var compose by remember { mutableStateOf(ComposeRequest()) }
    var scanned by remember { mutableStateOf<AccountConfig?>(null) }
    val scope = rememberCoroutineScope()

    // Ab Android 13 braucht es die Erlaubnis für Mitteilungen über neue E-Mails.
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val notifyPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    val context = LocalContext.current
    LaunchedEffect(accounts.isNotEmpty()) {
        if (accounts.isNotEmpty() && Build.VERSION.SDK_INT >= 33 && vm.notifications.value &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notifyPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    LifecycleStartEffect(Unit) {
        vm.refreshIfStale()
        onStopOrDispose { }
    }

    // Jede Aktion meldet sich über die Insel am Kameraloch.
    var island by remember { mutableStateOf<IslandMessage?>(null) }
    var islandIds by remember { mutableLongStateOf(0L) }
    LaunchedEffect(Unit) {
        vm.events.collect { event ->
            islandIds++
            island = IslandMessage(islandIds, event.text, event.kind, (event as? UiEvent.Undoable)?.actionId)
        }
    }

    val mailto by mailtoRequests.collectAsStateWithLifecycle()
    LaunchedEffect(mailto) {
        mailto?.let {
            compose = it
            onMailtoHandled()
            if (vm.accounts.value.isNotEmpty()) nav.navigate("compose")
        }
    }

    fun openCompose(request: ComposeRequest = ComposeRequest()) {
        compose = request
        nav.navigate("compose")
    }

    fun reply(message: MessageSummary, body: MessageBody?, kind: ReplyKind, prefix: String?) {
        val request = ComposeRequest.create(kind, message, body, vm.account(message.accountId)?.email)
        openCompose(if (prefix != null) request.copy(body = prefix + "\n\n" + request.body) else request)
    }

    fun replyFromList(message: MessageSummary, kind: ReplyKind) {
        // Aus der Liste heraus ist der Text evtl. noch nicht geladen; fürs Zitat nachladen.
        scope.launch {
            val body = vm.loadBody(message).getOrNull()
            reply(message, body, kind, null)
        }
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val wide = maxWidth >= 600.dp
        NavHost(navController = nav, startDestination = "home") {
            screen("home") {
                HomeScaffold(
                    vm = vm,
                    wide = wide,
                    onOpenBox = { box -> nav.navigate("list/${enc(box.accountId)}/${enc(box.folder)}") },
                    onOpenMessage = { message, box ->
                        nav.navigate("message/${enc(message.key)}/${enc(box.accountId)}/${enc(box.folder)}")
                    },
                    onCompose = { openCompose(it) },
                    onReply = ::reply,
                    onReplyFromList = ::replyFromList,
                    onAddAccount = { nav.navigate("providers") },
                )
            }
            screen("list/{account}/{folder}") { entry ->
                val box = BoxRef(
                    entry.arguments?.getString("account").orEmpty(),
                    entry.arguments?.getString("folder").orEmpty(),
                )
                MessageListScreen(
                    vm = vm,
                    box = box,
                    onBack = { nav.back(entry) },
                    onOpen = { message ->
                        nav.navigate("message/${enc(message.key)}/${enc(box.accountId)}/${enc(box.folder)}")
                    },
                    onCompose = { openCompose(ComposeRequest(accountId = box.accountId.takeUnless { box.isUnified })) },
                    onReply = ::replyFromList,
                )
            }
            screen("message/{key}/{account}/{folder}") { entry ->
                MessageScreen(
                    vm = vm,
                    messageKey = entry.arguments?.getString("key").orEmpty(),
                    box = BoxRef(
                        entry.arguments?.getString("account").orEmpty(),
                        entry.arguments?.getString("folder").orEmpty(),
                    ),
                    onBack = { nav.back(entry) },
                    onReply = ::reply,
                )
            }
            sheet("compose") { entry ->
                ComposeScreen(vm = vm, request = compose, onClose = { nav.back(entry) })
            }
            sheet("providers") { entry ->
                ProviderPickerScreen(
                    onBack = { nav.back(entry) },
                    onPick = { nav.navigate("account/$it") },
                    onScanned = { config ->
                        scanned = config
                        nav.navigate("account/qr")
                    },
                )
            }
            screen("account/{provider}") { entry ->
                val providerId = entry.arguments?.getString("provider").orEmpty()
                AccountFormScreen(
                    vm = vm,
                    providerId = providerId,
                    prefill = scanned.takeIf { providerId == "qr" },
                    onCancel = { nav.back(entry) },
                    onDone = { nav.popBackStack("home", inclusive = false) },
                )
            }
        }

        island?.let { message ->
            key(message.id) {
                ActionIsland(
                    message = message,
                    onUndo = { id ->
                        vm.undo(id)
                        islandIds++
                        island = IslandMessage(islandIds, "Widerrufen", IslandKind.Done)
                    },
                    onDone = { if (island?.id == message.id) island = null },
                    // Zugeklappt sitzt die Kamera oben mittig, aufgeklappt rechts oben.
                    modifier = Modifier
                        .align(if (wide) BiasAlignment(0.5f, -1f) else Alignment.TopCenter)
                        .padding(top = 6.dp, start = 16.dp, end = 16.dp),
                )
            }
        }
    }
}

/** Grundgerüst mit den vier Tabs; aufgeklappt mit Leiste, Liste und Lesebereich nebeneinander. */
@Composable
private fun HomeScaffold(
    vm: MailViewModel,
    wide: Boolean,
    onOpenBox: (BoxRef) -> Unit,
    onOpenMessage: (MessageSummary, BoxRef) -> Unit,
    onCompose: (ComposeRequest) -> Unit,
    onReply: (MessageSummary, MessageBody?, ReplyKind, String?) -> Unit,
    onReplyFromList: (MessageSummary, ReplyKind) -> Unit,
    onAddAccount: () -> Unit,
) {
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    if (accounts.isEmpty()) {
        Welcome(onAddAccount)
        return
    }
    val mailboxes by vm.mailboxes.collectAsStateWithLifecycle()
    val unread by vm.messages(BoxRef.Unread).collectAsStateWithLifecycle()

    var tab by rememberSaveable { mutableStateOf(Tab.Start) }
    var inboxKey by rememberSaveable { mutableStateOf(BoxRef.UnifiedInbox.key) }
    var editing by remember { mutableStateOf(false) }
    // Nur aufgeklappt: Postfach in der mittleren Spalte und die gewählte E-Mail rechts.
    var midKey by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedKey by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedBoxKey by rememberSaveable { mutableStateOf(BoxRef.UnifiedInbox.key) }

    val inboxBox = boxOf(inboxKey)
    val chips = buildList {
        add(BoxRef.UnifiedInbox to "Alle")
        add(BoxRef.Unread to "Ungelesen")
        add(BoxRef.Flagged to "Markiert")
        if (accounts.size > 1) accounts.forEach { add(BoxRef(it.id, "INBOX") to it.description) }
    }

    fun selectTab(next: Tab) {
        tab = next
        midKey = null
        editing = false
    }

    fun openBox(box: BoxRef) {
        if (wide) {
            midKey = box.key
        } else {
            onOpenBox(box)
        }
    }

    fun openMessage(message: MessageSummary, box: BoxRef) {
        if (wide) {
            selectedKey = message.key
            selectedBoxKey = box.key
        } else {
            onOpenMessage(message, box)
        }
    }

    fun showInbox(box: BoxRef) {
        inboxKey = box.key
        selectTab(Tab.Inbox)
    }

    fun openRole(role: MailboxRole) {
        val boxes = accounts.mapNotNull { account -> mailboxes[account.id].orEmpty().firstOrNull { it.role == role } }
        if (boxes.size == 1) openBox(boxes.first().ref) else selectTab(Tab.Folders)
    }

    BackHandler(enabled = wide && midKey != null) { midKey = null }
    BackHandler(enabled = !editing && tab != Tab.Start && (!wide || midKey == null)) { selectTab(Tab.Start) }

    val navBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

    @Composable
    fun TabContent(current: Tab, bottomInset: Dp) {
        when (current) {
            Tab.Start -> StartScreen(
                vm = vm,
                onCompose = { onCompose(ComposeRequest()) },
                onOpenMessage = { openMessage(it, BoxRef.UnifiedInbox) },
                onTile = { tile ->
                    when (tile) {
                        StartTile.Inbox -> showInbox(BoxRef.UnifiedInbox)
                        StartTile.Flagged -> showInbox(BoxRef.Flagged)
                        StartTile.Sent -> openRole(MailboxRole.SENT)
                        StartTile.Drafts -> openRole(MailboxRole.DRAFTS)
                    }
                },
                onShowUnread = { showInbox(BoxRef.Unread) },
                onShowInbox = { showInbox(BoxRef.UnifiedInbox) },
                onProfile = if (wide) null else ({ selectTab(Tab.Account) }),
                bottomInset = bottomInset,
            )
            Tab.Inbox -> MessageListScreen(
                vm = vm,
                box = inboxBox,
                onBack = null,
                onOpen = { openMessage(it, inboxBox) },
                onCompose = { onCompose(ComposeRequest(accountId = inboxBox.accountId.takeUnless { inboxBox.isUnified })) },
                onReply = onReplyFromList,
                title = "Posteingang",
                chips = chips,
                onSelectBox = { inboxKey = it.key },
                selectedKey = if (wide) selectedKey else null,
                bottomInset = bottomInset,
                showFab = !wide,
                onEditingChange = { editing = it },
            )
            Tab.Folders -> FoldersScreen(
                vm = vm,
                onOpen = ::openBox,
                selected = midKey?.let(::boxOf),
                bottomInset = bottomInset,
            )
            Tab.Account -> AccountTabScreen(vm = vm, onAddAccount = onAddAccount, bottomInset = bottomInset)
        }
    }

    if (!wide) {
        val barSpace = 64.dp + 18.dp + navBottom
        Box(Modifier.fillMaxSize().screenBackground()) {
            Crossfade(targetState = tab, animationSpec = tween(180), label = "tab") { current ->
                TabContent(current, barSpace)
            }
            FloatingTabBar(
                tab = tab,
                unread = unread.size,
                visible = !editing,
                onSelect = ::selectTab,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(start = 14.dp, end = 14.dp, bottom = 18.dp + navBottom),
            )
        }
        return
    }

    // Aufgeklappt: Leiste | Liste | Lesebereich.
    val colors = Luna.colors
    Row(Modifier.fillMaxSize().screenBackground()) {
        Column(
            Modifier
                .width(84.dp)
                .fillMaxHeight()
                .windowInsetsPadding(WindowInsets.statusBars)
                .padding(top = 20.dp, bottom = 20.dp + navBottom),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Tab.entries.forEach { item ->
                TabButton(
                    item,
                    selected = tab == item,
                    badge = if (item == Tab.Inbox) unread.size else 0,
                    modifier = Modifier
                        .width(68.dp)
                        .height(62.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (tab == item) colors.cell else Color.Transparent),
                ) { selectTab(item) }
            }
            Spacer(Modifier.weight(1f))
            Box(
                Modifier
                    .size(56.dp)
                    .shadow(12.dp, RoundedCornerShape(12.dp), clip = false)
                    .inverseSurface(colors.inverseBrush, RoundedCornerShape(12.dp))
                    .pressScale { onCompose(ComposeRequest()) },
                contentAlignment = Alignment.Center,
            ) {
                Icon(LunaIcons.Plus, contentDescription = "Neue E-Mail", tint = colors.onInverse, modifier = Modifier.size(26.dp))
            }
        }
        VerticalDivider(thickness = 1.dp, color = colors.separator)
        Box(Modifier.width(372.dp).fillMaxHeight()) {
            val mid = midKey?.let(::boxOf)
            Crossfade(targetState = mid to tab, animationSpec = tween(200), label = "middle") { (box, current) ->
                if (box != null) {
                    MessageListScreen(
                        vm = vm,
                        box = box,
                        onBack = { midKey = null },
                        onOpen = { openMessage(it, box) },
                        onCompose = { onCompose(ComposeRequest(accountId = box.accountId.takeUnless { box.isUnified })) },
                        onReply = onReplyFromList,
                        selectedKey = selectedKey,
                        bottomInset = navBottom,
                        showFab = false,
                    )
                } else {
                    TabContent(current, navBottom)
                }
            }
        }
        VerticalDivider(thickness = 1.dp, color = colors.separator)
        Box(
            Modifier
                .weight(1f)
                .fillMaxHeight()
                .background(if (colors.isSilver) Color.Transparent else colors.cell)
                .windowInsetsPadding(WindowInsets.statusBars)
                .padding(start = 14.dp, end = 14.dp, top = 6.dp, bottom = 18.dp + navBottom),
        ) {
            val paperShape = RoundedCornerShape(12.dp)
            Box(
                Modifier
                    .fillMaxSize()
                    .shadow(if (colors.isSilver) 0.dp else 14.dp, paperShape)
                    .clip(paperShape)
                    .background(if (colors.isSilver) Color(0x6128292D) else colors.background)
                    .then(if (colors.isSilver) Modifier.border(1.dp, Color(0x1AFFFFFF), paperShape) else Modifier),
            ) {
                val current = selectedKey
                if (current == null) {
                    Column(
                        Modifier.fillMaxSize().padding(30.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text("Keine E-Mail ausgewählt", style = LunaType.title2.copy(fontSize = 19.sp, fontWeight = FontWeight.Bold), color = colors.label)
                        Spacer(Modifier.height(6.dp))
                        Text("Wähle links eine Nachricht.", style = LunaType.subhead, color = colors.secondaryLabel, textAlign = TextAlign.Center)
                    }
                } else {
                    key(current) {
                        MessageScreen(
                            vm = vm,
                            messageKey = current,
                            box = boxOf(selectedBoxKey),
                            onBack = null,
                            onReply = onReply,
                            onClosed = { selectedKey = null },
                            onKeyChange = { selectedKey = it },
                        )
                    }
                }
            }
        }
    }
}

/** Schwebende, leicht abgerundete Tab-Leiste. */
@Composable
private fun FloatingTabBar(tab: Tab, unread: Int, visible: Boolean, onSelect: (Tab) -> Unit, modifier: Modifier = Modifier) {
    val colors = Luna.colors
    androidx.compose.animation.AnimatedVisibility(
        visible = visible,
        enter = slideInVertically(tween(400, easing = CubicBezierEasing(0.32f, 0.72f, 0f, 1f))) { it * 2 },
        exit = slideOutVertically(tween(400, easing = CubicBezierEasing(0.32f, 0.72f, 0f, 1f))) { it * 2 },
        modifier = modifier,
    ) {
        val shape = RoundedCornerShape(14.dp)
        Row(
            Modifier
                .fillMaxWidth()
                .height(64.dp)
                .shadow(18.dp, shape, ambientColor = Color.Black, spotColor = Color.Black)
                .clip(shape)
                .background(colors.bar)
                .border(1.dp, if (colors.isSilver) Color(0x24FFFFFF) else colors.separator, shape)
                .padding(horizontal = 6.dp, vertical = 4.dp),
        ) {
            Tab.entries.forEach { item ->
                TabButton(item, selected = tab == item, badge = if (item == Tab.Inbox) unread else 0, modifier = Modifier.weight(1f).fillMaxHeight()) {
                    onSelect(item)
                }
            }
        }
    }
}

@Composable
private fun TabButton(tab: Tab, selected: Boolean, badge: Int, modifier: Modifier, onClick: () -> Unit) {
    val colors = Luna.colors
    val tint = if (selected) colors.label else colors.tertiaryLabel
    Box(modifier.pressFade(onClick = onClick), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(tab.icon, contentDescription = null, tint = tint, modifier = Modifier.size(24.dp))
            Spacer(Modifier.height(4.dp))
            Text(
                tab.label,
                style = LunaType.caption.copy(fontSize = 11.sp, fontWeight = FontWeight.SemiBold),
                color = tint,
                maxLines = 1,
            )
        }
        if (badge > 0) {
            Box(
                Modifier
                    .align(Alignment.TopCenter)
                    .offset(x = 14.dp, y = 2.dp)
                    .heightIn(min = 17.dp)
                    .widthIn(min = 17.dp)
                    .clip(RoundedCornerShape(9.dp))
                    .background(colors.red)
                    .padding(horizontal = 5.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    if (badge > 99) "99+" else badge.toString(),
                    style = LunaType.caption.copy(fontSize = 10.5.sp, fontWeight = FontWeight.Bold),
                    color = Color.White,
                )
            }
        }
    }
}
