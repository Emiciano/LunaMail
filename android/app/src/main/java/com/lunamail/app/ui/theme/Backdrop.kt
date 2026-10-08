package com.lunamail.app.ui.theme

import androidx.compose.animation.core.EaseInOut
import androidx.compose.animation.core.InfiniteRepeatableSpec
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.ImageShader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import kotlin.math.max
import kotlin.random.Random

/** Fortschritt der drei langsam wandernden Lichtflecken im Silber-Design (je 0..1). */
class SilverPhase(val a: State<Float>, val b: State<Float>, val c: State<Float>)

private val StillPhase = SilverPhase(mutableFloatStateOf(0f), mutableFloatStateOf(0f), mutableFloatStateOf(0f))

val LocalSilverPhase = staticCompositionLocalOf { StillPhase }

private fun drift(ms: Int): InfiniteRepeatableSpec<Float> = infiniteRepeatable(tween(ms, easing = EaseInOut), RepeatMode.Reverse)

/**
 * Stellt die Animation für den Silber-Hintergrund bereit. Alle Bildschirme lesen dieselbe
 * Phase, so wandert der Hintergrund beim Wechsel zwischen Ansichten nicht sprunghaft.
 */
@Composable
fun SilverPhaseProvider(active: Boolean, content: @Composable () -> Unit) {
    if (!active) {
        content()
        return
    }
    val transition = rememberInfiniteTransition(label = "silver")
    val a = transition.animateFloat(0f, 1f, drift(22_000), label = "a")
    val b = transition.animateFloat(0f, 1f, drift(28_000), label = "b")
    val c = transition.animateFloat(0f, 1f, drift(25_000), label = "c")
    val phase = remember(a, b, c) { SilverPhase(a, b, c) }
    CompositionLocalProvider(LocalSilverPhase provides phase, content = content)
}

/** Feines Rauschen (Grain) als kachelbares Bild, einmal erzeugt. */
private val grain: ImageBitmap by lazy {
    val size = 160
    val random = Random(7)
    val pixels = IntArray(size * size) {
        val v = random.nextInt(256)
        (0xFF shl 24) or (v shl 16) or (v shl 8) or v
    }
    android.graphics.Bitmap.createBitmap(pixels, size, size, android.graphics.Bitmap.Config.ARGB_8888).asImageBitmap()
}

private val grainBrush by lazy { ShaderBrush(ImageShader(grain, TileMode.Repeated, TileMode.Repeated)) }

private val SilverBase = listOf(Color(0xFF55575D), Color(0xFF2F3034), Color(0xFF1D1E21))

private fun DrawScope.blob(
    color: Color,
    alpha: Float,
    left: Float,
    top: Float,
    width: Float,
    height: Float,
    dx: Float,
    dy: Float,
    scaleTo: Float,
    t: Float,
    stop: Float,
) {
    val w = size.width * width
    val h = size.height * height
    val x = size.width * left + w * dx * t
    val y = size.height * top + h * dy * t
    val s = 1f + (scaleTo - 1f) * t
    val center = Offset(x + w / 2, y + h / 2)
    val radius = max(w, h) / 2
    // Als Kreis zeichnen und dann zur Ellipse stauchen, das entspricht dem weichen CSS-Fleck.
    translate(center.x, center.y) {
        scale(s * w / (2 * radius), s * h / (2 * radius), Offset.Zero) {
            drawCircle(
                Brush.radialGradient(0f to color.copy(alpha = alpha), stop to Color.Transparent, center = Offset.Zero, radius = radius),
                radius = radius,
                center = Offset.Zero,
            )
        }
    }
}

private fun DrawScope.drawSilver(phase: SilverPhase) {
    drawRect(
        Brush.radialGradient(
            0f to SilverBase[0],
            0.55f to SilverBase[1],
            1f to SilverBase[2],
            center = Offset(size.width * 0.2f, 0f),
            radius = max(size.width * 1.2f, size.height * 0.9f),
        ),
    )
    blob(Color(0xFFD4D6DB), 0.55f, -0.1f, 0.05f, 0.7f, 0.55f, 0.35f, 0.25f, 1.25f, phase.a.value, 0.68f)
    blob(Color(0xFF9A9DA4), 0.55f, 0.45f, 0.35f, 0.8f, 0.6f, -0.4f, -0.2f, 0.85f, phase.b.value, 0.68f)
    blob(Color(0xFF0F1012), 0.75f, 0.15f, 0.7f, 0.6f, 0.45f, 0.3f, -0.35f, 1.3f, phase.c.value, 0.7f)
    drawRect(grainBrush, alpha = 0.05f)
}

/**
 * Hintergrund eines ganzen Bildschirms: im Silber-Design der animierte Verlauf mit Grain,
 * sonst die einfarbige Hintergrundfarbe.
 */
@Composable
fun Modifier.screenBackground(): Modifier {
    val colors = Luna.colors
    if (!colors.isSilver) return this.background(colors.background)
    val phase = LocalSilverPhase.current
    return this.drawBehind { drawSilver(phase) }
}
