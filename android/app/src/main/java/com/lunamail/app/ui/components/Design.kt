package com.lunamail.app.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lunamail.app.data.Account
import com.lunamail.app.data.SenderLogos
import com.lunamail.app.ui.icons.LunaIcons
import com.lunamail.app.ui.theme.InterTightFamily
import com.lunamail.app.ui.theme.Luna
import com.lunamail.app.ui.theme.LunaType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.Calendar

/** Drücken lässt Karten und Kacheln leicht schrumpfen, wie im Prototyp. */
@Composable
fun Modifier.pressScale(enabled: Boolean = true, scale: Float = 0.96f, onClick: () -> Unit): Modifier {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val value by animateFloatAsState(if (pressed) scale else 1f, tween(if (pressed) 90 else 260), label = "pressScale")
    return this
        .graphicsLayer {
            scaleX = value
            scaleY = value
            alpha = if (enabled) 1f else 0.35f
        }
        .clickable(interactionSource = interaction, indication = null, enabled = enabled, onClick = onClick)
}

/** Kräftige Fläche: Schwarz, Weiß oder metallisches Silber je nach Design. */
fun Modifier.inverseSurface(brush: Brush, shape: Shape): Modifier = this.clip(shape).background(brush, shape)

/** Quadratischer Knopf mit Symbol (42 dp, Radius 10). */
@Composable
fun SquareButton(
    icon: ImageVector,
    description: String,
    modifier: Modifier = Modifier,
    size: Dp = 42.dp,
    tint: Color = Luna.colors.label,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val background by animateColorAsState(
        if (pressed) Luna.colors.cellPressed else Luna.colors.cell,
        tween(if (pressed) 0 else 200),
        label = "square",
    )
    Box(
        modifier
            .size(size)
            .clip(RoundedCornerShape(10.dp))
            .background(background)
            .graphicsLayer { alpha = if (enabled) 1f else 0.35f }
            .clickable(interactionSource = interaction, indication = null, enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = description, tint = tint, modifier = Modifier.size(21.dp))
    }
}

/** Knopf mit Text (Radius 8): kräftig für die Hauptaktion, grau für Nebenaktionen. */
@Composable
fun LunaButton(
    label: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    primary: Boolean = true,
    enabled: Boolean = true,
    height: Dp = 36.dp,
    onClick: () -> Unit,
) {
    val colors = Luna.colors
    val shape = RoundedCornerShape(8.dp)
    Row(
        modifier
            .height(height)
            .then(if (primary) Modifier.inverseSurface(colors.inverseBrush, shape) else Modifier.clip(shape).background(colors.cellPressed))
            .pressFade(enabled = enabled, onClick = onClick)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        val content = if (primary) colors.onInverse else colors.label
        Text(label, style = LunaType.button, color = content, maxLines = 1)
        if (icon != null) {
            Spacer(Modifier.width(7.dp))
            Icon(icon, contentDescription = null, tint = content, modifier = Modifier.size(16.dp))
        }
    }
}

/** Filter-Chip (Radius 8). */
@Composable
fun Chip(label: String, selected: Boolean, onClick: () -> Unit) {
    val colors = Luna.colors
    val shape = RoundedCornerShape(8.dp)
    Box(
        Modifier
            .height(36.dp)
            .then(if (selected) Modifier.inverseSurface(colors.inverseBrush, shape) else Modifier.clip(shape).background(colors.cell))
            .pressFade(onClick = onClick)
            .padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            style = LunaType.button.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
            color = if (selected) colors.onInverse else colors.label,
            maxLines = 1,
        )
    }
}

/** Suchfeld als graue Fläche (44 dp, Radius 10). */
@Composable
fun SearchBox(query: String, onQueryChange: (String) -> Unit, modifier: Modifier = Modifier) {
    val colors = Luna.colors
    Row(
        modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(colors.cell)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(LunaIcons.Search, contentDescription = null, tint = colors.secondaryLabel, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(10.dp))
        Box(Modifier.weight(1f)) {
            if (query.isEmpty()) Text("Suchen", style = LunaType.body, color = colors.secondaryLabel)
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = LunaType.body.copy(color = colors.label),
                cursorBrush = SolidColor(colors.label),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (query.isNotEmpty()) {
            Icon(
                LunaIcons.Clear,
                contentDescription = "Suche löschen",
                tint = colors.tertiaryLabel,
                modifier = Modifier.size(18.dp).pressFade { onQueryChange("") },
            )
        }
    }
}

/** Abschnittsüberschrift mit optionalem Link rechts („Alle ansehen“). */
@Composable
fun SectionHeader(title: String, count: Int? = null, action: String? = null, onAction: () -> Unit = {}) {
    Row(
        Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, bottom = 12.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        Text(title, style = LunaType.sectionTitle, color = Luna.colors.label)
        if (count != null && count > 0) {
            Spacer(Modifier.width(6.dp))
            Text(count.toString(), style = LunaType.sectionTitle, color = Luna.colors.tertiaryLabel)
        }
        Spacer(Modifier.weight(1f))
        if (action != null) {
            Text(
                action,
                style = LunaType.subhead.copy(fontWeight = FontWeight.SemiBold),
                color = Luna.colors.secondaryLabel,
                modifier = Modifier.pressFade(onClick = onAction).padding(vertical = 2.dp),
            )
        }
    }
}

/** Seitentitel mit Aktion rechts („Bearbeiten“). */
@Composable
fun PageTitle(title: String, modifier: Modifier = Modifier, action: @Composable RowScope.() -> Unit = {}) {
    Row(
        modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 14.dp, bottom = 14.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        Text(
            title,
            style = LunaType.display,
            color = Luna.colors.label,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        action()
    }
}

/** Auswahlkästchen im Bearbeiten-Modus (abgerundetes Quadrat). */
@Composable
fun SelectBox(selected: Boolean) {
    val colors = Luna.colors
    val shape = RoundedCornerShape(7.dp)
    Box(
        Modifier
            .size(24.dp)
            .then(
                if (selected) Modifier.inverseSurface(colors.inverseBrush, shape)
                else Modifier.clip(shape).border(2.dp, colors.strongFill, shape)
            ),
        contentAlignment = Alignment.Center,
    ) {
        if (selected) Icon(LunaIcons.Check, null, tint = colors.onInverse, modifier = Modifier.size(15.dp))
    }
}

private fun initialsOf(name: String): String =
    name.split(' ', '.', '_', '-', '@')
        .filter { it.isNotBlank() && it.first().isLetterOrDigit() }
        .take(2)
        .joinToString("") { it.first().uppercase() }
        .ifEmpty { name.firstOrNull()?.uppercase() ?: "?" }

/**
 * Quadratische Kachel mit dem Logo des Absenders, solange keins da ist mit Initialen.
 * [unread] zeigt einen roten Punkt oben rechts.
 */
@Composable
fun SenderLogo(
    address: String,
    name: String,
    size: Dp = 48.dp,
    radius: Dp = 10.dp,
    unread: Boolean = false,
    inverse: Boolean = false,
) {
    val context = LocalContext.current
    val domain = remember(address) { SenderLogos.domainOf(address) }
    val logo by produceState<ImageBitmap?>(SenderLogos.cached(domain)?.asImageBitmap(), domain) {
        if (value == null && domain != null) value = SenderLogos.load(context.applicationContext, domain)?.asImageBitmap()
    }
    val colors = Luna.colors
    val shape = RoundedCornerShape(radius)
    Box(Modifier.size(size)) {
        val current = logo
        if (current != null) {
            // Das Logo ist schon quadratisch und ohne Polster aufbereitet, ohne Rahmen darum.
            Image(
                current,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                filterQuality = androidx.compose.ui.graphics.FilterQuality.High,
                modifier = Modifier.fillMaxSize().clip(shape),
            )
        } else {
            val initials = remember(name) { initialsOf(name) }
            Box(
                Modifier
                    .fillMaxSize()
                    .then(if (inverse) Modifier.inverseSurface(colors.inverseBrush, shape) else Modifier.clip(shape).background(colors.cell)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    initials,
                    color = if (inverse) colors.onInverse else colors.label,
                    style = LunaType.headline.copy(
                        fontFamily = InterTightFamily,
                        fontWeight = FontWeight.Bold,
                        fontSize = (size.value * 0.35f).sp,
                    ),
                    maxLines = 1,
                )
            }
        }
        if (unread) UnreadBadgeDot()
    }
}

@Composable
private fun BoxScope.UnreadBadgeDot() {
    Box(
        Modifier
            .align(Alignment.TopEnd)
            .offset(x = 3.dp, y = (-3).dp)
            .size(12.dp)
            .clip(CircleShape)
            .background(Luna.colors.swipeRow)
            .padding(2.5.dp)
            .clip(CircleShape)
            .background(Luna.colors.red),
    )
}

/**
 * Kontobild: das gewählte Foto oder die Initialen auf kräftiger Fläche. Mit [onEdit]
 * erscheint ein Kamera-Symbol, Antippen öffnet dann die Fotoauswahl.
 */
@Composable
fun AccountAvatar(
    account: Account?,
    picture: File?,
    version: Long?,
    size: Dp = 44.dp,
    radius: Dp = 10.dp,
    onEdit: (() -> Unit)? = null,
) {
    val colors = Luna.colors
    val shape = RoundedCornerShape(radius)
    val image by produceState<ImageBitmap?>(null, picture?.path, version) {
        value = if (picture == null || version == null) null else withContext(Dispatchers.IO) {
            runCatching { android.graphics.BitmapFactory.decodeFile(picture.path)?.asImageBitmap() }.getOrNull()
        }
    }
    Box(
        Modifier
            .size(size)
            .then(if (onEdit != null) Modifier.pressFade(onClick = onEdit) else Modifier),
    ) {
        val current = image
        if (current != null) {
            Image(current, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().clip(shape))
        } else {
            Box(Modifier.fillMaxSize().inverseSurface(colors.inverseBrush, shape), contentAlignment = Alignment.Center) {
                Text(
                    initialsOf(account?.displayName?.ifBlank { null } ?: account?.description ?: account?.email ?: "?"),
                    color = colors.onInverse,
                    style = LunaType.headline.copy(fontFamily = InterTightFamily, fontWeight = FontWeight.ExtraBold, fontSize = (size.value * 0.36f).sp),
                    maxLines = 1,
                )
            }
        }
        if (onEdit != null) {
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .offset(x = 5.dp, y = 5.dp)
                    .size(22.dp)
                    .clip(RoundedCornerShape(7.dp))
                    .background(if (colors.isSilver) Color(0xFF3A3B40) else colors.background)
                    .border(1.dp, colors.separator, RoundedCornerShape(7.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(LunaIcons.Camera, contentDescription = "Bild ändern", tint = colors.label, modifier = Modifier.size(12.dp))
            }
        }
    }
}

/** Überschrift für Tagesgruppen in der Liste: „Heute“, „Gestern“, „Montag“, „3. Oktober“. */
fun formatDayGroup(timestamp: Long, now: Long = System.currentTimeMillis()): String {
    fun Calendar.startOfDay() = (clone() as Calendar).apply {
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis
    val day = Calendar.getInstance().apply { timeInMillis = timestamp }
    val today = Calendar.getInstance().apply { timeInMillis = now }
    val days = ((today.startOfDay() - day.startOfDay()) / 86_400_000L).toInt()
    return when {
        days <= 0 -> "Heute"
        days == 1 -> "Gestern"
        days < 7 -> java.text.SimpleDateFormat("EEEE", java.util.Locale.GERMANY).format(timestamp)
        day.get(Calendar.YEAR) == today.get(Calendar.YEAR) -> java.text.SimpleDateFormat("d. MMMM", java.util.Locale.GERMANY).format(timestamp)
        else -> java.text.SimpleDateFormat("d. MMMM yyyy", java.util.Locale.GERMANY).format(timestamp)
    }
}

/** Zeitpunkt, zu dem ein Bildschirm aufgebaut wurde; für [appearIn]. */
@Composable
fun rememberShownAt(): Long = remember { android.os.SystemClock.uptimeMillis() }

/**
 * Lässt ein Element beim Öffnen eines Bildschirms von unten einblenden, gestaffelt nach
 * [index]. Was erst später (z. B. beim Scrollen) erscheint, steht sofort da.
 */
@Composable
fun Modifier.appearIn(shownAt: Long, index: Int): Modifier {
    val animate = remember { android.os.SystemClock.uptimeMillis() - shownAt < 700 }
    val progress = remember { androidx.compose.animation.core.Animatable(if (animate) 0f else 1f) }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        if (!animate) return@LaunchedEffect
        kotlinx.coroutines.delay(index.coerceAtMost(12) * 45L)
        progress.animateTo(1f, tween(480, easing = androidx.compose.animation.core.CubicBezierEasing(0.2f, 0.9f, 0.25f, 1f)))
    }
    return this.graphicsLayer {
        alpha = progress.value
        translationY = (1f - progress.value) * 22.dp.toPx()
    }
}
