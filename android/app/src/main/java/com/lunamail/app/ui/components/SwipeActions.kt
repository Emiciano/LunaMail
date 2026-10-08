package com.lunamail.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.lunamail.app.ui.theme.Luna
import com.lunamail.app.ui.theme.LunaType
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.text.font.FontWeight
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

data class SwipeAction(
    val label: String,
    val icon: ImageVector,
    val color: Color,
    val contentColor: Color = Color.White,
    val onClick: () -> Unit,
)

/**
 * Wischaktionen wie in Apple Mail: Ein kurzer Wisch deckt Tasten auf, ein langer Wisch
 * löst die äußerste Aktion direkt aus (mit spürbarem Einrasten). [leading] liegt links
 * (nach rechts wischen), [trailing] rechts (nach links wischen); jeweils die erste Aktion
 * ist die äußerste, die beim Durchwischen ausgelöst wird.
 *
 * [openKey]/[onOpenChange] sorgen dafür, dass immer nur eine Zeile offen ist.
 */
@Composable
fun SwipeActionsBox(
    key: Any,
    openKey: Any?,
    onOpenChange: (Any?) -> Unit,
    leading: List<SwipeAction>,
    trailing: List<SwipeAction>,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    /** Ob die äußerste rechte Aktion die Zeile entfernt (dann gleitet sie ganz hinaus). */
    trailingRemoves: Boolean = true,
    content: @Composable () -> Unit,
) {
    val density = LocalDensity.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val buttonWidth = with(density) { 76.dp.toPx() }
    val offset = remember { Animatable(0f) }
    var armed by remember { mutableStateOf(false) }

    // Breite per onSizeChanged statt BoxWithConstraints: Letzteres setzt pro Listenzeile eine
    // Subcomposition auf und macht das Scrollen spürbar teurer.
    var widthPx by remember { mutableIntStateOf(0) }

    Box(modifier.clipToBounds().onSizeChanged { widthPx = it.width }) {
        val width = widthPx.toFloat().coerceAtLeast(1f)
        val leadingWidth = buttonWidth * leading.size
        val trailingWidth = buttonWidth * trailing.size
        val fullThreshold = width * 0.6f
        val springSpec = spring<Float>(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMediumLow)

        fun settleTo(target: Float, velocity: Float = 0f) {
            scope.launch { offset.animateTo(target, springSpec, velocity) }
        }

        // Schließt sich, sobald eine andere Zeile geöffnet wird.
        LaunchedEffect(openKey) {
            if (openKey != key && offset.value != 0f) offset.animateTo(0f, springSpec)
        }

        val draggableState = rememberDraggableState { delta ->
            val min = if (trailing.isEmpty()) 0f else -width
            val max = if (leading.isEmpty()) 0f else width
            val next = (offset.value + delta).coerceIn(min, max)
            scope.launch { offset.snapTo(next) }
            val nowArmed = abs(next) >= fullThreshold
            if (nowArmed != armed) {
                armed = nowArmed
                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
            }
        }

        val value = offset.value
        if (value != 0f) {
            val actions = if (value > 0) leading else trailing
            val revealed = abs(value)
            Row(
                Modifier
                    .matchParentSize()
                    .background(actions.first().color),
                horizontalArrangement = if (value > 0) Arrangement.Start else Arrangement.End,
            ) {
                // Die äußerste Aktion (jeweils die erste) sitzt am Rand. Beim Durchwischen
                // übernimmt sie die ganze Breite.
                val sides = if (value > 0) actions else actions.reversed()
                sides.forEach { action ->
                    val isPrimary = action === actions.first()
                    val share = when {
                        armed -> if (isPrimary) revealed else 0f
                        else -> revealed / actions.size
                    }
                    if (share > 0f) {
                        SwipeButton(
                            action = action,
                            width = with(density) { share.toDp() },
                            emphasized = armed && isPrimary,
                            alignment = when {
                                !armed -> Alignment.Center
                                value > 0 -> Alignment.CenterEnd
                                else -> Alignment.CenterStart
                            },
                        ) {
                            onOpenChange(null)
                            settleTo(0f)
                            action.onClick()
                        }
                    }
                }
            }
        }

        val rowBackground = Luna.colors.swipeRow
        Box(
            Modifier
                .offset { IntOffset(offset.value.roundToInt(), 0) }
                // Im Silber-Design sind Zeilen durchsichtig; beim Wischen brauchen sie eine
                // Fläche, damit die Aktionen nicht durchscheinen.
                .drawBehind { if (offset.value != 0f) drawRect(rowBackground) }
                .draggable(
                    state = draggableState,
                    orientation = Orientation.Horizontal,
                    enabled = enabled,
                    onDragStarted = { onOpenChange(key) },
                    onDragStopped = { velocity ->
                        val current = offset.value
                        when {
                            current >= fullThreshold -> {
                                // Nach rechts durchgewischt: Aktion auslösen, Zeile federt zurück.
                                armed = false
                                leading.first().onClick()
                                onOpenChange(null)
                                settleTo(0f, velocity)
                            }
                            current <= -fullThreshold -> {
                                armed = false
                                onOpenChange(null)
                                if (trailingRemoves) {
                                    scope.launch {
                                        offset.animateTo(-width, springSpec, velocity)
                                        trailing.first().onClick()
                                    }
                                } else {
                                    trailing.first().onClick()
                                    settleTo(0f, velocity)
                                }
                            }
                            current > 0 && (current > leadingWidth / 2 || velocity > 1200f) -> settleTo(leadingWidth, velocity)
                            current < 0 && (current < -trailingWidth / 2 || velocity < -1200f) -> settleTo(-trailingWidth, velocity)
                            else -> {
                                onOpenChange(null)
                                settleTo(0f, velocity)
                            }
                        }
                    },
                ),
        ) {
            content()
            // Tippen auf eine offene Zeile schließt sie, statt die Mail zu öffnen.
            if (offset.value != 0f) {
                Box(
                    Modifier
                        .matchParentSize()
                        .pressFade {
                            onOpenChange(null)
                            settleTo(0f)
                        },
                )
            }
        }
    }
}

@Composable
private fun SwipeButton(
    action: SwipeAction,
    width: androidx.compose.ui.unit.Dp,
    alignment: Alignment,
    emphasized: Boolean,
    onClick: () -> Unit,
) {
    // Beim Durchwischen springt das Symbol leicht auf, wie in Apple Mail.
    val scale by animateFloatAsState(
        if (emphasized) 1.18f else 1f,
        spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "swipeIcon",
    )
    Box(
        Modifier
            .width(width)
            .fillMaxHeight()
            .background(action.color)
            .pressFade(onClick = onClick),
        contentAlignment = alignment,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.width(76.dp).padding(horizontal = 4.dp),
        ) {
            Icon(
                action.icon,
                contentDescription = null,
                tint = action.contentColor,
                modifier = Modifier.size(22.dp).graphicsLayer { scaleX = scale; scaleY = scale },
            )
            Text(action.label, style = LunaType.caption.copy(fontWeight = FontWeight.Bold), color = action.contentColor, maxLines = 1, overflow = TextOverflow.Clip)
        }
    }
}
