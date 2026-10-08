package com.lunamail.app.ui.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

/**
 * Strich-Icons im Stil von Lucide, wie in LunaOffice und LunaMail am Desktop:
 * 24er-Raster, runde Enden, keine Füllung. Eingefärbt wird über `tint`.
 */
object LunaIcons {
    private const val STROKE = 1.75f

    private fun circle(cx: Float, cy: Float, r: Float) =
        "M${cx - r} ${cy}a$r $r 0 1 0 ${2 * r} 0a$r $r 0 1 0 ${-2 * r} 0z"

    private fun rect(x: Float, y: Float, w: Float, h: Float, rx: Float) =
        "M${x + rx} ${y}h${w - 2 * rx}a$rx $rx 0 0 1 $rx ${rx}v${h - 2 * rx}a$rx $rx 0 0 1 ${-rx} ${rx}" +
            "h${-(w - 2 * rx)}a$rx $rx 0 0 1 ${-rx} ${-rx}v${-(h - 2 * rx)}a$rx $rx 0 0 1 $rx ${-rx}z"

    private fun icon(name: String, vararg paths: String, filled: Boolean = false): ImageVector =
        ImageVector.Builder(name = "Luna.$name", defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
            .apply {
                paths.forEach { d ->
                    addPath(
                        pathData = PathParser().parsePathString(d).toNodes(),
                        fill = if (filled) SolidColor(Color.Black) else null,
                        stroke = SolidColor(Color.Black),
                        strokeLineWidth = STROKE,
                        strokeLineCap = StrokeCap.Round,
                        strokeLineJoin = StrokeJoin.Round,
                    )
                }
            }
            .build()

    // Postfächer
    val Inbox by lazy {
        icon("Inbox", "M22 12h-6l-2 3h-4l-2-3H2", "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z")
    }
    val Inboxes by lazy {
        icon("Inboxes", rect(6f, 4f, 16f, 13f, 2f), "m22 7-7.1 3.78c-.57.3-1.23.3-1.8 0L6 7", "M2 8v11c0 1.1.9 2 2 2h14")
    }
    val Draft by lazy {
        icon("Draft", "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z", "M14 2v4a2 2 0 0 0 2 2h4", "M10 9H8", "M16 13H8", "M16 17H8")
    }
    val Send by lazy {
        icon("Send", "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z", "m21.854 2.147-10.94 10.939")
    }
    val Archive by lazy {
        icon("Archive", rect(2f, 3f, 20f, 5f, 1f), "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8", "M10 12h4")
    }
    val Trash by lazy {
        icon("Trash", "M3 6h18", "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6", "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2")
    }
    val Spam by lazy {
        icon(
            "Spam",
            "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
            "M12 8v4",
            "M12 16h.01",
        )
    }
    val Folder by lazy {
        icon("Folder", "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z")
    }

    // Markierungen und Status
    val Flag by lazy { icon("Flag", "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22v-7") }
    val FlagFilled by lazy {
        ImageVector.Builder(name = "Luna.FlagFilled", defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
            .addPath(
                pathData = PathParser().parsePathString("M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z").toNodes(),
                fill = SolidColor(Color.Black),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = STROKE,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
            .addPath(
                pathData = PathParser().parsePathString("M4 22v-7").toNodes(),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = STROKE,
                strokeLineCap = StrokeCap.Round,
            )
            .build()
    }
    val MailUnread by lazy {
        icon("MailUnread", "M22 10.5V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11.5", "m2 7 8.97 5.7a1.94 1.94 0 0 0 2.06 0l2.6-1.66", circle(19f, 5f, 3f))
    }
    val MailOpen by lazy {
        icon("MailOpen", "M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6z", "m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10")
    }
    val Paperclip by lazy {
        icon("Paperclip", "m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48")
    }

    // Aktionen
    val Reply by lazy { icon("Reply", "m9 17-5-5 5-5", "M20 18v-2a4 4 0 0 0-4-4H4") }
    val ReplyAll by lazy { icon("ReplyAll", "m7 17-5-5 5-5", "m12 17-5-5 5-5", "M22 18v-2a4 4 0 0 0-4-4H7") }
    val Forward by lazy { icon("Forward", "m15 17 5-5-5-5", "M4 18v-2a4 4 0 0 1 4-4h12") }
    val Move by lazy {
        icon(
            "Move",
            "M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1",
            "M2 13h10",
            "m9 16 3-3-3-3",
        )
    }
    val Compose by lazy {
        icon(
            "Compose",
            "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",
            "M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z",
        )
    }
    val More by lazy {
        icon("More", circle(5f, 12f, 1f), circle(12f, 12f, 1f), circle(19f, 12f, 1f), filled = true)
    }
    val Settings by lazy {
        icon("Settings", "M21 4h-7", "M10 4H3", "M21 12h-9", "M8 12H3", "M21 20h-5", "M12 20H3", "M14 2v4", "M8 10v4", "M16 18v4")
    }
    val Filter by lazy { icon("Filter", "M3 6h18", "M7 12h10", "M10 18h4") }
    val Search by lazy { icon("Search", circle(11f, 11f, 8f), "m21 21-4.3-4.3") }
    val Clear by lazy { icon("Clear", circle(12f, 12f, 10f), "m15 9-6 6", "m9 9 6 6") }
    val Check by lazy { icon("Check", "M20 6 9 17l-5-5") }
    val Close by lazy { icon("Close", "M18 6 6 18", "m6 6 12 12") }
    val ArrowUp by lazy { icon("ArrowUp", "m5 12 7-7 7 7", "M12 19V5") }
    val ScanQr by lazy {
        icon("ScanQr", "M3 7V5a2 2 0 0 1 2-2h2", "M17 3h2a2 2 0 0 1 2 2v2", "M21 17v2a2 2 0 0 1-2 2h-2", "M7 21H5a2 2 0 0 1-2-2v-2", "M7 12h10")
    }

    // Pfeile
    val ChevronRight by lazy { icon("ChevronRight", "m9 18 6-6-6-6") }
    val ChevronLeft by lazy { icon("ChevronLeft", "m15 18-6-6 6-6") }
    val ChevronDown by lazy { icon("ChevronDown", "m6 9 6 6 6-6") }
    val ChevronUp by lazy { icon("ChevronUp", "m18 15-6-6-6 6") }

    // Navigation und Neues Design
    val Plus by lazy { icon("Plus", "M5 12h14", "M12 5v14") }
    val Home by lazy {
        icon("Home", "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8", "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z")
    }
    val User by lazy { icon("User", circle(12f, 7f, 4f), "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2") }
    val Camera by lazy {
        icon("Camera", "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z", circle(12f, 13f, 3f))
    }
    val Bell by lazy { icon("Bell", "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0") }
    val ArrowLeft by lazy { icon("ArrowLeft", "m12 19-7-7 7-7", "M19 12H5") }
    val ArrowRight by lazy { icon("ArrowRight", "M5 12h14", "m12 5 7 7-7 7") }
    val Mail by lazy { icon("Mail", rect(2f, 4f, 20f, 16f, 2f), "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7") }
    val Alert by lazy { icon("Alert", circle(12f, 12f, 10f), "M12 8v4", "M12 16h.01") }
    val Swipe by lazy { icon("Swipe", "M3 12h18", "m15 6 6 6-6 6") }
}
