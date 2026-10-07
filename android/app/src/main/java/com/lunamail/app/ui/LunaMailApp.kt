package com.lunamail.app.ui

import android.net.Uri
import androidx.compose.animation.AnimatedContentTransitionScope
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
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.SnackbarDuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
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
import com.lunamail.app.ui.screens.AccountFormScreen
import com.lunamail.app.ui.screens.ComposeRequest
import com.lunamail.app.ui.screens.ComposeScreen
import com.lunamail.app.ui.screens.MailboxesScreen
import com.lunamail.app.ui.screens.MessageListScreen
import com.lunamail.app.ui.screens.MessageScreen
import com.lunamail.app.ui.screens.ProviderPickerScreen
import com.lunamail.app.ui.screens.SettingsScreen
import com.lunamail.app.ui.theme.Luna
import kotlinx.coroutines.flow.StateFlow

/** Kurve der iOS-Push-Animation (UINavigationController). */
private val IosEasing = CubicBezierEasing(0.2f, 0.9f, 0.25f, 1f)
private const val PUSH_MS = 420

private fun push(): AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition = {
    slideInHorizontally(tween(PUSH_MS, easing = IosEasing)) { it }
}
private fun pushExit(): AnimatedContentTransitionScope<NavBackStackEntry>.() -> ExitTransition = {
    slideOutHorizontally(tween(PUSH_MS, easing = IosEasing)) { -it / 3 } + fadeOut(tween(PUSH_MS), targetAlpha = 0.6f)
}
private fun popEnter(): AnimatedContentTransitionScope<NavBackStackEntry>.() -> EnterTransition = {
    slideInHorizontally(tween(PUSH_MS, easing = IosEasing)) { -it / 3 } + fadeIn(tween(PUSH_MS), initialAlpha = 0.6f)
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
        enterTransition = { slideInVertically(tween(PUSH_MS, easing = IosEasing)) { it } },
        exitTransition = { fadeOut(tween(PUSH_MS), targetAlpha = 0.8f) },
        popEnterTransition = { fadeIn(tween(PUSH_MS), initialAlpha = 0.8f) },
        popExitTransition = { slideOutVertically(tween(PUSH_MS, easing = IosEasing)) { it } },
    ) { content(it) }

/** Verhindert doppeltes Zurückgehen, wenn während einer Animation zweimal getippt wird. */
private fun NavController.back(entry: NavBackStackEntry) {
    if (entry.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) popBackStack()
}

private fun enc(value: String) = Uri.encode(value)

@Composable
fun LunaMailApp(mailtoRequests: StateFlow<ComposeRequest?>, onMailtoHandled: () -> Unit) {
    val vm: MailViewModel = viewModel()
    val nav = rememberNavController()
    val snackbar = remember { SnackbarHostState() }
    var compose by remember { mutableStateOf(ComposeRequest()) }
    var scanned by remember { mutableStateOf<AccountConfig?>(null) }

    LifecycleStartEffect(Unit) {
        vm.refreshIfStale()
        onStopOrDispose { }
    }

    LaunchedEffect(Unit) {
        vm.events.collect { event ->
            snackbar.currentSnackbarData?.dismiss()
            when (event) {
                is UiEvent.Info -> snackbar.showSnackbar(event.text, duration = SnackbarDuration.Short)
                is UiEvent.Undoable -> {
                    val result = snackbar.showSnackbar(event.text, actionLabel = "Widerrufen", duration = SnackbarDuration.Short)
                    if (result == SnackbarResult.ActionPerformed) vm.undo(event.actionId)
                }
            }
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

    Box(Modifier.fillMaxSize()) {
        NavHost(navController = nav, startDestination = "mailboxes") {
            screen("mailboxes") {
                MailboxesScreen(
                    vm = vm,
                    onOpen = { box -> nav.navigate("list/${enc(box.accountId)}/${enc(box.folder)}") },
                    onCompose = { openCompose() },
                    onSettings = { nav.navigate("settings") },
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
                    onOpen = { message -> nav.navigate("message/${enc(message.key)}/${enc(vm.title(box))}") },
                    onCompose = { openCompose(ComposeRequest(accountId = box.accountId.takeUnless { box.isUnified })) },
                )
            }
            screen("message/{key}/{back}") { entry ->
                MessageScreen(
                    vm = vm,
                    messageKey = entry.arguments?.getString("key").orEmpty(),
                    backLabel = entry.arguments?.getString("back").orEmpty(),
                    onBack = { nav.back(entry) },
                    onReply = { message, body -> openCompose(ComposeRequest.reply(message, body)) },
                    onCompose = { openCompose() },
                )
            }
            sheet("compose") { entry ->
                ComposeScreen(vm = vm, request = compose, onClose = { nav.back(entry) })
            }
            screen("settings") { entry ->
                SettingsScreen(vm = vm, onBack = { nav.back(entry) }, onAddAccount = { nav.navigate("providers") })
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
                    onDone = { nav.popBackStack("mailboxes", inclusive = false) },
                )
            }
        }

        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .windowInsetsPadding(WindowInsets.navigationBars)
                .padding(start = 12.dp, end = 12.dp, bottom = 60.dp),
        ) { data ->
            Snackbar(
                snackbarData = data,
                shape = RoundedCornerShape(14.dp),
                containerColor = Color(0xF02C2C2E),
                contentColor = Color.White,
                actionColor = Luna.colors.accent,
            )
        }
    }
}
