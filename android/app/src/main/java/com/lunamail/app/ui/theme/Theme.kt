package com.lunamail.app.ui.theme

import android.app.Activity
import android.content.ContextWrapper
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import com.lunamail.app.R

/** Die drei Designs, zwischen denen man unter „Konto“ wählen kann. */
enum class ThemeMode(val key: String, val label: String) {
    Light("light", "Hell"),
    Dark("dark", "Dunkel"),
    Silver("silver", "Silber");

    companion object {
        fun fromKey(key: String?) = entries.firstOrNull { it.key == key } ?: Light
    }
}

/**
 * Farben im Uber-ähnlichen LunaMail-Design: neutrale Flächen, Schwarz bzw. Weiß als
 * Akzent, kein Blau. [inverse] ist die kräftige Fläche für Hauptknöpfe und die erste Karte.
 */
@Immutable
data class LunaColors(
    /** Text-Aktionen und Symbole (Schwarz im hellen, Weiß im dunklen Design). */
    val accent: Color,
    /** Text und Icons auf einer Fläche in Akzentfarbe. */
    val onAccent: Color,
    val background: Color,
    val groupedBackground: Color,
    /** Karten und Kacheln (s1). */
    val cell: Color,
    /** Gedrückte Karten, graue Knöpfe (s2). */
    val cellPressed: Color,
    val label: Color,
    val secondaryLabel: Color,
    val tertiaryLabel: Color,
    val separator: Color,
    val fill: Color,
    /** Rahmen von Auswahlkästchen (s3). */
    val strongFill: Color,
    val bar: Color,
    /** Hintergrund einer Zeile, während sie zur Seite gewischt wird. */
    val swipeRow: Color,
    val inverse: Color,
    val onInverse: Color,
    val inverseBrush: Brush,
    val red: Color,
    val orange: Color,
    val purple: Color,
    val green: Color,
    val blue: Color,
    val gray: Color,
    val isDark: Boolean,
    val isSilver: Boolean = false,
)

private val LunaLight = LunaColors(
    accent = Color(0xFF000000),
    onAccent = Color(0xFFFFFFFF),
    background = Color(0xFFFFFFFF),
    groupedBackground = Color(0xFFFFFFFF),
    cell = Color(0xFFF3F3F3),
    cellPressed = Color(0xFFE8E8E8),
    label = Color(0xFF000000),
    secondaryLabel = Color(0xFF5E5E5E),
    tertiaryLabel = Color(0xFF9E9E9E),
    separator = Color(0xFFECECEC),
    fill = Color(0xFFF3F3F3),
    strongFill = Color(0xFFDADADA),
    bar = Color(0xF2FFFFFF),
    swipeRow = Color(0xFFFFFFFF),
    inverse = Color(0xFF000000),
    onInverse = Color(0xFFFFFFFF),
    inverseBrush = Brush.linearGradient(listOf(Color(0xFF000000), Color(0xFF000000))),
    red = Color(0xFFE11900),
    orange = Color(0xFFC27C0E),
    purple = Color(0xFF5E5E5E),
    green = Color(0xFF000000),
    blue = Color(0xFF000000),
    gray = Color(0xFF5E5E5E),
    isDark = false,
)

private val LunaDark = LunaColors(
    accent = Color(0xFFFFFFFF),
    onAccent = Color(0xFF000000),
    background = Color(0xFF000000),
    groupedBackground = Color(0xFF000000),
    cell = Color(0xFF161616),
    cellPressed = Color(0xFF232323),
    label = Color(0xFFFFFFFF),
    secondaryLabel = Color(0xFFA6A6A6),
    tertiaryLabel = Color(0xFF6B6B6B),
    separator = Color(0xFF222222),
    fill = Color(0xFF161616),
    strongFill = Color(0xFF333333),
    bar = Color(0xF0000000),
    swipeRow = Color(0xFF000000),
    inverse = Color(0xFFFFFFFF),
    onInverse = Color(0xFF000000),
    inverseBrush = Brush.linearGradient(listOf(Color(0xFFFFFFFF), Color(0xFFFFFFFF))),
    red = Color(0xFFFF5A47),
    orange = Color(0xFFF5A623),
    purple = Color(0xFF6B6B6B),
    green = Color(0xFFFFFFFF),
    blue = Color(0xFFFFFFFF),
    gray = Color(0xFF4A4A4A),
    isDark = true,
)

/** Metallisch glänzende Fläche im Silber-Design. */
val SilverMetal = Brush.linearGradient(
    0f to Color(0xFFFBFBFC),
    0.45f to Color(0xFFC9CBD0),
    0.7f to Color(0xFFEEEFF1),
    1f to Color(0xFFB7BAC0),
)

/**
 * Silber: Karten liegen halbtransparent über einem langsam bewegten, grauen Hintergrund
 * (siehe [screenBackground]). Echte Hintergrund-Unschärfe gibt es auf Android nicht für
 * beliebige Flächen, darum sind die Karten etwas deckender als im Prototyp.
 */
private val LunaSilver = LunaColors(
    accent = Color(0xFFF3F3F5),
    onAccent = Color(0xFF121214),
    background = Color(0xFF2D2E32),
    groupedBackground = Color(0xFF2D2E32),
    cell = Color(0x24FFFFFF),
    cellPressed = Color(0x33FFFFFF),
    label = Color(0xFFF3F3F5),
    secondaryLabel = Color(0xFFADAFB4),
    tertiaryLabel = Color(0xFF7E8086),
    separator = Color(0x17FFFFFF),
    fill = Color(0x24FFFFFF),
    strongFill = Color(0x38FFFFFF),
    bar = Color(0xB828292D),
    swipeRow = Color(0xFF2B2C30),
    inverse = Color(0xFFE7E8EB),
    onInverse = Color(0xFF121214),
    inverseBrush = SilverMetal,
    red = Color(0xFFFF6B5A),
    orange = Color(0xFFF2B64F),
    purple = Color(0xFF7E8086),
    green = Color(0xFFE7E8EB),
    blue = Color(0xFFE7E8EB),
    gray = Color(0xFF5A5C62),
    isDark = true,
    isSilver = true,
)

fun ThemeMode.colors(): LunaColors = when (this) {
    ThemeMode.Light -> LunaLight
    ThemeMode.Dark -> LunaDark
    ThemeMode.Silver -> LunaSilver
}

val LocalLunaColors = staticCompositionLocalOf { LunaLight }

object Luna {
    val colors: LunaColors
        @Composable get() = LocalLunaColors.current
}

@OptIn(ExperimentalTextApi::class)
private fun variable(res: Int, weight: Int) =
    Font(res, FontWeight(weight), variationSettings = FontVariation.Settings(FontVariation.weight(weight)))

/** Inter für Fließtext, wie im Prototyp. */
val InterFamily = FontFamily(listOf(400, 500, 600, 700, 800).map { variable(R.font.inter, it) })

/** Inter Tight für Überschriften. */
val InterTightFamily = FontFamily(listOf(500, 600, 700, 800).map { variable(R.font.inter_tight, it) })

object LunaType {
    private val tight = (-0.03).em
    /** Große Seitentitel („Posteingang“, „Ordner“). */
    val display = TextStyle(fontFamily = InterTightFamily, fontSize = 32.sp, lineHeight = 34.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = tight)
    /** Betreff in der Leseansicht. */
    val subjectTitle = TextStyle(fontFamily = InterTightFamily, fontSize = 28.sp, lineHeight = 31.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = tight)
    val largeTitle = TextStyle(fontFamily = InterTightFamily, fontSize = 32.sp, lineHeight = 36.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = tight)
    val title2 = TextStyle(fontFamily = InterTightFamily, fontSize = 22.sp, lineHeight = 26.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = tight)
    val sectionTitle = TextStyle(fontFamily = InterTightFamily, fontSize = 21.sp, lineHeight = 25.sp, fontWeight = FontWeight.Bold, letterSpacing = tight)
    val cardTitle = TextStyle(fontFamily = InterTightFamily, fontSize = 20.sp, lineHeight = 23.sp, fontWeight = FontWeight.Bold, letterSpacing = tight)
    val title3 = TextStyle(fontFamily = InterTightFamily, fontSize = 20.sp, lineHeight = 24.sp, fontWeight = FontWeight.Bold, letterSpacing = tight)
    val headline = TextStyle(fontFamily = InterFamily, fontSize = 16.sp, lineHeight = 21.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.015).em)
    val body = TextStyle(fontFamily = InterFamily, fontSize = 16.sp, lineHeight = 22.sp)
    val callout = TextStyle(fontFamily = InterFamily, fontSize = 16.sp, lineHeight = 21.sp)
    val subhead = TextStyle(fontFamily = InterFamily, fontSize = 14.5.sp, lineHeight = 19.sp)
    val footnote = TextStyle(fontFamily = InterFamily, fontSize = 13.sp, lineHeight = 18.sp)
    val caption = TextStyle(fontFamily = InterFamily, fontSize = 12.sp, lineHeight = 16.sp)
    val button = TextStyle(fontFamily = InterFamily, fontSize = 14.sp, lineHeight = 18.sp, fontWeight = FontWeight.Bold)
    /** Kleine Abschnittsüberschrift („Design“, „Konten“). */
    val sectionLabel = TextStyle(fontFamily = InterFamily, fontSize = 13.sp, lineHeight = 17.sp, fontWeight = FontWeight.Bold)
}

@Composable
fun LunaMailTheme(mode: ThemeMode = ThemeMode.Light, content: @Composable () -> Unit) {
    val colors = mode.colors()
    val base = if (colors.isDark) darkColorScheme() else lightColorScheme()
    val scheme = base.copy(
        primary = colors.accent,
        onPrimary = colors.onAccent,
        background = colors.background,
        onBackground = colors.label,
        surface = colors.background,
        onSurface = colors.label,
        onSurfaceVariant = colors.secondaryLabel,
        surfaceContainer = colors.background,
        surfaceContainerHigh = if (colors.isSilver) Color(0xFF3A3B40) else colors.background,
        surfaceContainerHighest = if (colors.isSilver) Color(0xFF3A3B40) else colors.background,
        surfaceContainerLow = colors.background,
        inverseSurface = if (colors.isDark) Color(0xFF2C2C2E) else Color(0xFF111111),
        inverseOnSurface = Color.White,
        inversePrimary = colors.accent,
        error = colors.red,
    )

    // Statusleisten-Symbole passend zum Design hell oder dunkel.
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            var context = view.context
            while (context is ContextWrapper && context !is Activity) context = context.baseContext
            val window = (context as? Activity)?.window ?: return@SideEffect
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !colors.isDark
                isAppearanceLightNavigationBars = !colors.isDark
            }
        }
    }

    CompositionLocalProvider(LocalLunaColors provides colors) {
        MaterialTheme(colorScheme = scheme, typography = Typography(bodyLarge = LunaType.body), content = content)
    }
}
