package com.lunamail.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Farben im LunaOffice-Design: Schwarz mit dunkelgrauen Flächen und Weiß als Akzent,
 * aufgebaut wie die klassischen iOS-Systemfarben.
 */
@Immutable
data class LunaColors(
    val accent: Color,
    /** Text und Icons auf einer Fläche in Akzentfarbe. */
    val onAccent: Color,
    val background: Color,
    val groupedBackground: Color,
    val cell: Color,
    val cellPressed: Color,
    val label: Color,
    val secondaryLabel: Color,
    val tertiaryLabel: Color,
    val separator: Color,
    val fill: Color,
    val bar: Color,
    val red: Color,
    val orange: Color,
    val purple: Color,
    val green: Color,
    val blue: Color,
    val gray: Color,
    val isDark: Boolean,
)

private val LunaDark = LunaColors(
    accent = Color(0xFFFFFFFF),
    onAccent = Color(0xFF0B0B0B),
    background = Color(0xFF000000),
    groupedBackground = Color(0xFF000000),
    cell = Color(0xFF151515),
    cellPressed = Color(0xFF262626),
    label = Color(0xFFFFFFFF),
    secondaryLabel = Color(0x73FFFFFF),
    tertiaryLabel = Color(0x47FFFFFF),
    separator = Color(0x1FFFFFFF),
    fill = Color(0xFF1A1A1A),
    bar = Color(0xF20B0B0B),
    red = Color(0xFFE5484D),
    orange = Color(0xFFF59E0B),
    purple = Color(0xFF8B5CF6),
    green = Color(0xFF30D158),
    blue = Color(0xFF3B82F6),
    gray = Color(0xFF636366),
    isDark = true,
)

val LocalLunaColors = staticCompositionLocalOf { LunaDark }

object Luna {
    val colors: LunaColors
        @Composable get() = LocalLunaColors.current
}

/** Schriftgrößen angelehnt an die iOS-Textstile (Large Title, Headline, Body …). */
object LunaType {
    val largeTitle = TextStyle(fontSize = 34.sp, lineHeight = 41.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.3.sp)
    val title2 = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.Bold)
    val title3 = TextStyle(fontSize = 20.sp, lineHeight = 25.sp, fontWeight = FontWeight.SemiBold)
    val headline = TextStyle(fontSize = 17.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold)
    val body = TextStyle(fontSize = 17.sp, lineHeight = 22.sp)
    val callout = TextStyle(fontSize = 16.sp, lineHeight = 21.sp)
    val subhead = TextStyle(fontSize = 15.sp, lineHeight = 20.sp)
    val footnote = TextStyle(fontSize = 13.sp, lineHeight = 18.sp)
    val caption = TextStyle(fontSize = 12.sp, lineHeight = 16.sp)
    /** Abschnittsüberschrift wie in LunaOffice: klein, Großbuchstaben, weit gesperrt. */
    val sectionLabel = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium, letterSpacing = 1.7.sp)
}

@Composable
fun LunaMailTheme(content: @Composable () -> Unit) {
    // LunaOffice ist immer dunkel, unabhängig vom Systemmodus.
    val colors = LunaDark
    val scheme = darkColorScheme(
        primary = colors.accent,
        background = colors.background,
        surface = colors.cell,
        onPrimary = colors.onAccent,
        onSurface = colors.label,
        onBackground = colors.label,
        surfaceContainer = colors.cell,
        surfaceContainerHigh = colors.cell,
        surfaceContainerLow = colors.groupedBackground,
        inverseSurface = Color(0xFF2C2C2E),
        inverseOnSurface = Color.White,
        inversePrimary = colors.accent,
        error = colors.red,
    )
    CompositionLocalProvider(LocalLunaColors provides colors) {
        MaterialTheme(colorScheme = scheme, typography = Typography(bodyLarge = LunaType.body), content = content)
    }
}
