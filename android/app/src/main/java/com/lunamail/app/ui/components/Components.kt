package com.lunamail.app.ui.components

import com.lunamail.app.ui.icons.LunaIcons
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lunamail.app.ui.theme.Luna
import com.lunamail.app.ui.theme.LunaType
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/** Antippen ohne Material-Ripple, dafür mit iOS-typischem Abdunkeln beim Drücken. */
@Composable
fun Modifier.pressFade(enabled: Boolean = true, onClick: () -> Unit): Modifier {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val alpha = animateFloatAsState(if (pressed) 0.3f else 1f, tween(if (pressed) 0 else 220), label = "pressFade")
    // Der Wert wird erst in der Zeichenphase gelesen, so löst das Ausblenden keine Recomposition aus.
    return this
        .graphicsLayer { this.alpha = if (enabled) alpha.value else 0.35f }
        .clickable(interactionSource = interaction, indication = null, enabled = enabled, onClick = onClick)
}

/** Hintergrund-Highlight wie bei iOS-Tabellenzellen. */
@Composable
fun Modifier.cellPress(onClick: () -> Unit, onLongClick: (() -> Unit)? = null): Modifier {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val background = animateColorAsState(
        if (pressed) Luna.colors.cellPressed else Color.Transparent,
        tween(if (pressed) 0 else 300),
        label = "cellPress",
    )
    return this
        .drawBehind { drawRect(background.value) }
        .combinedClickable(
            interactionSource = interaction,
            indication = null,
            onClick = onClick,
            onLongClick = onLongClick,
        )
}

@Composable
fun BackButton(label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .heightIn(min = 44.dp)
            .pressFade(onClick = onClick)
            .padding(start = 8.dp, end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            LunaIcons.ChevronLeft,
            contentDescription = "Zurück",
            tint = Luna.colors.accent,
            modifier = Modifier.size(20.dp),
        )
        Text(label, style = LunaType.body, color = Luna.colors.accent, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun TextAction(label: String, enabled: Boolean = true, bold: Boolean = false, onClick: () -> Unit) {
    Text(
        label,
        style = if (bold) LunaType.headline else LunaType.body,
        color = Luna.colors.accent,
        modifier = Modifier
            .pressFade(enabled = enabled, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 11.dp),
    )
}

@Composable
fun BarIcon(icon: ImageVector, description: String, enabled: Boolean = true, tint: Color = Luna.colors.accent, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(44.dp)
            .pressFade(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = description, tint = tint, modifier = Modifier.size(24.dp))
    }
}

/**
 * Navigationsleiste im iOS-Stil: Der große Titel liegt als erstes Element in der Liste;
 * sobald er weggescrollt ist, blendet die Leiste den kleinen Titel und eine Trennlinie ein.
 */
@Composable
fun NavigationBar(
    title: String,
    collapsed: Boolean,
    background: Color,
    navigation: @Composable RowScope.() -> Unit = {},
    actions: @Composable RowScope.() -> Unit = {},
) {
    val titleAlpha by animateFloatAsState(if (collapsed) 1f else 0f, tween(180), label = "navTitle")
    val barColor by animateColorAsState(if (collapsed) Luna.colors.bar else background, tween(180), label = "navBar")
    Column(Modifier.background(barColor).windowInsetsPadding(WindowInsets.statusBars)) {
        Box(Modifier.fillMaxWidth().height(44.dp)) {
            Row(Modifier.align(Alignment.CenterStart), verticalAlignment = Alignment.CenterVertically, content = navigation)
            Text(
                title,
                style = LunaType.headline,
                color = Luna.colors.label,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier.align(Alignment.Center).padding(horizontal = 96.dp).alpha(titleAlpha),
            )
            Row(Modifier.align(Alignment.CenterEnd), verticalAlignment = Alignment.CenterVertically, content = actions)
        }
        HorizontalDivider(thickness = 0.5.dp, color = Luna.colors.separator.copy(alpha = Luna.colors.separator.alpha * titleAlpha))
    }
}

@Composable
fun rememberCollapsed(listState: LazyListState): Boolean {
    val collapsed by remember(listState) {
        derivedStateOf { listState.firstVisibleItemIndex > 0 || listState.firstVisibleItemScrollOffset > 60 }
    }
    return collapsed
}

@Composable
fun LargeTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = LunaType.largeTitle,
        color = Luna.colors.label,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier.padding(start = 16.dp, end = 16.dp, top = 2.dp, bottom = 8.dp),
    )
}

@Composable
fun BottomToolbar(content: @Composable RowScope.() -> Unit) {
    Column(Modifier.background(Luna.colors.bar).windowInsetsPadding(WindowInsets.navigationBars)) {
        HorizontalDivider(thickness = 0.5.dp, color = Luna.colors.separator)
        Row(
            Modifier.fillMaxWidth().height(49.dp).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            content = content,
        )
    }
}

@Composable
fun SearchField(query: String, onQueryChange: (String) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Luna.colors.fill)
            .height(36.dp)
            .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(LunaIcons.Search, contentDescription = null, tint = Luna.colors.secondaryLabel, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(6.dp))
        Box(Modifier.weight(1f)) {
            if (query.isEmpty()) Text("Suchen", style = LunaType.body, color = Luna.colors.secondaryLabel)
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                textStyle = LunaType.body.copy(color = Luna.colors.label),
                cursorBrush = SolidColor(Luna.colors.accent),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (query.isNotEmpty()) {
            Icon(
                LunaIcons.Clear,
                contentDescription = "Suche löschen",
                tint = Luna.colors.tertiaryLabel,
                modifier = Modifier.size(18.dp).pressFade { onQueryChange("") },
            )
        }
    }
}

/** Abgerundete, eingerückte Gruppe wie bei „Inset Grouped“-Tabellen. */
@Composable
fun GroupedSection(
    header: String? = null,
    footer: String? = null,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        if (header != null) {
            Text(
                header.uppercase(),
                style = LunaType.sectionLabel,
                color = Luna.colors.tertiaryLabel,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(start = 4.dp, top = 24.dp, bottom = 8.dp),
            )
        } else {
            Spacer(Modifier.height(16.dp))
        }
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(Luna.colors.cell),
            content = content,
        )
        if (footer != null) {
            Text(
                footer,
                style = LunaType.footnote,
                color = Luna.colors.secondaryLabel,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 6.dp),
            )
        }
    }
}

@Composable
fun CellRow(
    title: String,
    icon: ImageVector? = null,
    iconTint: Color = Luna.colors.accent,
    value: String? = null,
    titleColor: Color = Luna.colors.label,
    showChevron: Boolean = true,
    showDivider: Boolean = true,
    onClick: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().cellPress(onClick)) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 46.dp).padding(start = 16.dp, end = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (icon != null) {
                Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(24.dp))
                Spacer(Modifier.width(14.dp))
            }
            Text(title, style = LunaType.body, color = titleColor, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            // Zähler rollen beim Ändern weich nach oben bzw. unten.
            AnimatedContent(
                targetState = value,
                transitionSpec = {
                    val up = (targetState?.toIntOrNull() ?: 0) > (initialState?.toIntOrNull() ?: 0)
                    (slideInVertically(tween(220)) { if (up) it else -it } + fadeIn(tween(220))) togetherWith
                        (slideOutVertically(tween(220)) { if (up) -it else it } + fadeOut(tween(160))) using
                        SizeTransform(clip = true)
                },
                label = "cellValue",
            ) { shown ->
                if (shown != null) {
                    Row {
                        Text(shown, style = LunaType.body, color = Luna.colors.secondaryLabel, maxLines = 1)
                        Spacer(Modifier.width(6.dp))
                    }
                }
            }
            if (showChevron) {
                Icon(
                    LunaIcons.ChevronRight,
                    contentDescription = null,
                    tint = Luna.colors.tertiaryLabel,
                    modifier = Modifier.size(22.dp),
                )
            }
        }
        if (showDivider) {
            HorizontalDivider(
                thickness = 0.5.dp,
                color = Luna.colors.separator,
                modifier = Modifier.padding(start = if (icon != null) 54.dp else 16.dp),
            )
        }
    }
}

/** Runder Kontakt-Avatar mit Initialen, wie in der iOS-Kontaktdarstellung. */
@Composable
fun Avatar(name: String, size: Dp = 40.dp) {
    val initials = remember(name) {
        name.split(' ', '.', '_', '-')
            .filter { it.isNotBlank() && it.first().isLetter() }
            .take(2)
            .joinToString("") { it.first().uppercase() }
            .ifEmpty { name.firstOrNull()?.uppercase() ?: "?" }
    }
    val style = remember(size) { LunaType.headline.copy(fontSize = (size.value * 0.4f).sp) }
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(Color(0xFF2A2A2A)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initials,
            color = Color.White,
            style = style,
        )
    }
}

// Formatierer einmal pro Thread anlegen statt für jede Zeile neu (SimpleDateFormat ist teuer
// und nicht threadsicher).
private fun formatter(pattern: String) = ThreadLocal.withInitial { SimpleDateFormat(pattern, Locale.GERMANY) }
private val timeFormatter = formatter("HH:mm")
private val weekdayFormatter = formatter("EEEE")
private val dateFormatter = formatter("dd.MM.yy")
private val longFormatter = formatter("d. MMMM yyyy 'um' HH:mm")
private val timeFormat get() = timeFormatter.get()!!
private val weekdayFormat get() = weekdayFormatter.get()!!
private val dateFormat get() = dateFormatter.get()!!
private val longFormat get() = longFormatter.get()!!

/** „14:32“, „Gestern“, „Montag“ oder „03.10.26“ – wie in der Mail-Liste von Apple Mail. */
fun formatListDate(timestamp: Long, now: Long = System.currentTimeMillis()): String {
    val day = Calendar.getInstance().apply { timeInMillis = timestamp }
    val today = Calendar.getInstance().apply { timeInMillis = now }
    fun Calendar.startOfDay() = (clone() as Calendar).apply {
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis
    val days = ((today.startOfDay() - day.startOfDay()) / 86_400_000L).toInt()
    return when {
        days <= 0 -> timeFormat.format(timestamp)
        days == 1 -> "Gestern"
        days < 7 -> weekdayFormat.format(timestamp)
        else -> dateFormat.format(timestamp)
    }
}

fun formatLongDate(timestamp: Long): String = longFormat.format(timestamp)

fun formatTime(timestamp: Long): String = timeFormat.format(timestamp)

@Composable
fun PrimaryButton(label: String, enabled: Boolean = true, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Luna.colors.accent)
            .pressFade(enabled = enabled, onClick = onClick)
            .padding(vertical = 15.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = LunaType.headline, color = Luna.colors.onAccent)
    }
}
