package com.lunamail.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.layout
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lunamail.app.ui.IslandKind
import com.lunamail.app.ui.icons.LunaIcons
import com.lunamail.app.ui.theme.InterFamily
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/** Eine Meldung für die Aktions-Insel; [id] macht gleiche Texte zu neuen Meldungen. */
data class IslandMessage(val id: Long, val text: String, val kind: IslandKind, val undoId: Long? = null)

private fun lerp(start: Float, stop: Float, fraction: Float) = start + (stop - start) * fraction

private val IslandEase = CubicBezierEasing(0.32f, 0.72f, 0f, 1f)
private val PopEase = CubicBezierEasing(0.34f, 1.4f, 0.64f, 1f)

private fun IslandKind.icon(): ImageVector = when (this) {
    IslandKind.Delete -> LunaIcons.Trash
    IslandKind.Move -> LunaIcons.Archive
    IslandKind.Read -> LunaIcons.MailOpen
    IslandKind.Unread -> LunaIcons.Mail
    IslandKind.Flag, IslandKind.Unflag -> LunaIcons.Flag
    IslandKind.Sent -> LunaIcons.Send
    IslandKind.Draft -> LunaIcons.Draft
    IslandKind.Picture -> LunaIcons.Camera
    IslandKind.Done -> LunaIcons.Check
    IslandKind.Error -> LunaIcons.Alert
}

private fun IslandKind.tile(): Pair<Color, Color> = when (this) {
    IslandKind.Delete, IslandKind.Error -> Color(0xFFFF453A) to Color.White
    IslandKind.Flag -> Color(0xFFF2A93B) to Color.White
    IslandKind.Move, IslandKind.Read, IslandKind.Sent, IslandKind.Picture, IslandKind.Done -> Color.White to Color.Black
    IslandKind.Unread, IslandKind.Unflag, IslandKind.Draft -> Color(0xFF2C2C2E) to Color.White
}

/**
 * Kleine schwarze Insel, die bei jeder Aktion aus dem Kameraloch aufklappt, das Ergebnis
 * mit einer passenden Symbol-Animation zeigt und wieder zusammenfällt. Bei Aktionen, die
 * sich widerrufen lassen, steht rechts „Widerrufen“.
 */
@Composable
fun ActionIsland(message: IslandMessage, onUndo: (Long) -> Unit, onDone: () -> Unit, modifier: Modifier = Modifier) {
    val open = remember(message.id) { Animatable(0f) }
    val content = remember(message.id) { Animatable(0f) }
    val icon = remember(message.id) { Animatable(0f) }
    val holdMs = when {
        message.undoId != null -> 4_000L
        message.kind == IslandKind.Error -> 4_000L
        else -> 1_900L
    }

    LaunchedEffect(message.id) {
        launch { open.animateTo(1f, tween(380, easing = IslandEase)) }
        launch {
            delay(220)
            content.animateTo(1f, tween(220))
        }
        launch {
            delay(420)
            icon.animateTo(1f, tween(1_100, easing = LinearEasing))
        }
        delay(holdMs)
        content.animateTo(0f, tween(180))
        open.animateTo(0f, tween(380, easing = IslandEase))
        onDone()
    }

    val (tileColor, iconColor) = message.kind.tile()
    Box(
        modifier
            .layout { measurable, constraints ->
                // Gemessen wird die volle Pille; gezeichnet wird je nach Fortschritt vom
                // 12-dp-Punkt (Kameraloch) bis zur vollen Größe.
                val placeable = measurable.measure(Constraints(maxWidth = constraints.maxWidth))
                val p = open.value
                val dot = 12.dp.roundToPx()
                val width = lerp(dot.toFloat(), placeable.width.toFloat(), p).roundToInt()
                val height = lerp(dot.toFloat(), placeable.height.toFloat(), p).roundToInt()
                layout(width, height) {
                    placeable.place((width - placeable.width) / 2, (height - placeable.height) / 2)
                }
            }
            .graphicsLayer {
                val p = open.value
                shape = RoundedCornerShape(lerp(6f, 14f, p).dp)
                clip = true
                shadowElevation = 14.dp.toPx() * p
                translationY = lerp(4.dp.toPx(), 0f, p)
                alpha = if (p < 0.02f) 0f else 1f
            }
            .background(Color.Black),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            Modifier
                .widthIn(max = 420.dp)
                .padding(start = 6.dp, end = if (message.undoId != null) 6.dp else 16.dp, top = 6.dp, bottom = 6.dp)
                .graphicsLayer {
                    alpha = content.value
                    val s = lerp(0.6f, 1f, content.value)
                    scaleX = s
                    scaleY = s
                },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(30.dp).clip(RoundedCornerShape(9.dp)).background(tileColor),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    message.kind.icon(),
                    contentDescription = null,
                    tint = iconColor,
                    modifier = Modifier
                        .size(17.dp)
                        .graphicsLayer { iconMotion(message.kind, icon.value) },
                )
                if (message.kind == IslandKind.Unread) {
                    val dot = ((icon.value - 0.35f) / 0.25f).coerceIn(0f, 1f)
                    Box(
                        Modifier
                            .align(Alignment.TopEnd)
                            .padding(top = 5.dp, end = 5.dp)
                            .size(7.dp)
                            .graphicsLayer { scaleX = dot; scaleY = dot }
                            .clip(CircleShape)
                            .background(Color(0xFFFF453A)),
                    )
                }
            }
            Spacer(Modifier.width(10.dp))
            Text(
                message.text,
                color = Color.White,
                fontFamily = InterFamily,
                fontSize = 13.5.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            if (message.undoId != null) {
                Spacer(Modifier.width(12.dp))
                Text(
                    "Widerrufen",
                    color = Color.Black,
                    fontFamily = InterFamily,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color.White)
                        .pressFade { onUndo(message.undoId) }
                        .padding(horizontal = 10.dp, vertical = 7.dp),
                )
            }
        }
    }
}

/** Wert einer Keyframe-Kurve mit Stützstellen (Zeit 0..1 → Wert). */
private fun curve(t: Float, vararg points: Pair<Float, Float>): Float {
    if (t <= points.first().first) return points.first().second
    for (i in 1 until points.size) {
        val (t1, v1) = points[i]
        val (t0, v0) = points[i - 1]
        if (t <= t1) {
            val f = FastOutSlowInEasing.transform((t - t0) / (t1 - t0))
            return v0 + (v1 - v0) * f
        }
    }
    return points.last().second
}

/** Die Bewegung des Symbols je Aktion, wie im Prototyp (Wackeln, Fallen, Aufploppen …). */
private fun androidx.compose.ui.graphics.GraphicsLayerScope.iconMotion(kind: IslandKind, t: Float) {
    when (kind) {
        IslandKind.Delete, IslandKind.Error -> {
            transformOrigin = TransformOrigin(0.5f, 0.2f)
            rotationZ = curve(t, 0f to 0f, 0.14f to -16f, 0.28f to 13f, 0.42f to -8f, 0.56f to 4f, 0.7f to 0f, 1f to 0f)
            val s = curve(t, 0f to 1f, 0.6f to 1f, 0.7f to 0.9f, 1f to 1f)
            scaleX = s
            scaleY = s
        }
        IslandKind.Move -> {
            translationY = curve(t, 0f to -16f, 0.45f to 2f, 0.65f to -2f, 1f to 0f) * density
            alpha = curve(t, 0f to 0f, 0.45f to 1f, 1f to 1f)
        }
        IslandKind.Read, IslandKind.Unread, IslandKind.Picture, IslandKind.Done -> {
            val s = curve(t, 0f to 0.3f, 0.55f to 1.25f, 1f to 1f)
            scaleX = s
            scaleY = s
        }
        IslandKind.Flag -> {
            transformOrigin = TransformOrigin(0.2f, 0.9f)
            rotationZ = curve(t, 0f to 0f, 0.2f to -14f, 0.4f to 10f, 0.6f to -6f, 0.8f to 3f, 1f to 0f)
        }
        IslandKind.Unflag -> {
            rotationZ = curve(t, 0f to 0f, 0.5f to -20f, 1f to 0f)
            translationY = curve(t, 0f to 0f, 0.5f to 4f, 1f to 0f) * density
            alpha = curve(t, 0f to 1f, 0.5f to 0.3f, 1f to 1f)
        }
        IslandKind.Sent -> {
            val out = t < 0.385f
            val shift = if (out) curve(t, 0f to 0f, 0.38f to 16f) else curve(t, 0.39f to -16f, 0.75f to 0f, 1f to 0f)
            translationX = shift * density
            translationY = -shift * density
            alpha = if (out) curve(t, 0f to 1f, 0.38f to 0f) else curve(t, 0.39f to 0f, 0.75f to 1f, 1f to 1f)
        }
        IslandKind.Draft -> {
            translationY = curve(t, 0f to 0f, 0.25f to -3f, 0.5f to 1f, 0.75f to -1f, 1f to 0f) * density
            rotationZ = curve(t, 0f to 0f, 0.25f to -6f, 0.5f to 4f, 0.75f to 0f, 1f to 0f)
        }
    }
}
