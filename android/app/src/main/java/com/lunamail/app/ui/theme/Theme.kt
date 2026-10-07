package com.lunamail.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Systemfarben im Stil von iOS, jeweils für hell und dunkel. */
@Immutable
data class LunaColors(
    val accent: Color,
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
    val isDark: Boolean,
)

private val Light = LunaColors(
    accent = Color(0xFF007AFF),
    background = Color(0xFFFFFFFF),
    groupedBackground = Color(0xFFF2F2F7),
    cell = Color(0xFFFFFFFF),
    cellPressed = Color(0xFFD1D1D6),
    label = Color(0xFF000000),
    secondaryLabel = Color(0x993C3C43),
    tertiaryLabel = Color(0x4D3C3C43),
    separator = Color(0x4A3C3C43),
    fill = Color(0x1F767680),
    bar = Color(0xF2F9F9F9),
    red = Color(0xFFFF3B30),
    orange = Color(0xFFFF9500),
    purple = Color(0xFFAF52DE),
    green = Color(0xFF34C759),
    isDark = false,
)

private val Dark = LunaColors(
    accent = Color(0xFF0A84FF),
    background = Color(0xFF000000),
    groupedBackground = Color(0xFF000000),
    cell = Color(0xFF1C1C1E),
    cellPressed = Color(0xFF3A3A3C),
    label = Color(0xFFFFFFFF),
    secondaryLabel = Color(0x99EBEBF5),
    tertiaryLabel = Color(0x4DEBEBF5),
    separator = Color(0xA6545458),
    fill = Color(0x3D767680),
    bar = Color(0xF01C1C1E),
    red = Color(0xFFFF453A),
    orange = Color(0xFFFF9F0A),
    purple = Color(0xFFBF5AF2),
    green = Color(0xFF30D158),
    isDark = true,
)

val LocalLunaColors = staticCompositionLocalOf { Light }

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
}

@Composable
fun LunaMailTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) Dark else Light
    val scheme = if (colors.isDark) {
        darkColorScheme(
            primary = colors.accent,
            background = colors.background,
            surface = colors.cell,
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
    } else {
        lightColorScheme(
            primary = colors.accent,
            background = colors.background,
            surface = colors.cell,
            onSurface = colors.label,
            onBackground = colors.label,
            surfaceContainer = colors.cell,
            surfaceContainerHigh = colors.cell,
            surfaceContainerLow = colors.groupedBackground,
            inverseSurface = Color(0xFF2C2C2E),
            inverseOnSurface = Color.White,
            inversePrimary = Color(0xFF0A84FF),
            error = colors.red,
        )
    }
    CompositionLocalProvider(LocalLunaColors provides colors) {
        MaterialTheme(colorScheme = scheme, typography = Typography(bodyLarge = LunaType.body), content = content)
    }
}
