package com.lunamail.app.data

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Lädt Bilder aus HTML-Mails selbst statt über das WebView. Manche Mail-Server liefern nur an
 * „echte“ Browser aus oder leiten von http auf https um, was das WebView nicht mitmacht.
 */
object RemoteImages {
    class Result(val mimeType: String, val encoding: String?, val bytes: ByteArray)

    private const val USER_AGENT =
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36"
    private const val MAX_BYTES = 10_000_000

    fun fetch(url: String): Result {
        var current = URL(url)
        repeat(6) {
            val connection = (current.openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 15_000
                readTimeout = 20_000
                setRequestProperty("User-Agent", USER_AGENT)
                setRequestProperty("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")
            }
            try {
                val code = connection.responseCode
                if (code in 300..399) {
                    val location = connection.getHeaderField("Location") ?: throw IOException("Weiterleitung ohne Ziel ($code)")
                    current = URL(current, location)
                    return@repeat
                }
                if (code !in 200..299) throw IOException("Server antwortet mit HTTP $code")
                val bytes = connection.inputStream.use { input ->
                    val data = input.readBytes()
                    if (data.size > MAX_BYTES) throw IOException("Bild zu groß")
                    data
                }
                val type = connection.contentType.orEmpty()
                val mime = type.substringBefore(';').trim().ifBlank { "application/octet-stream" }
                val charset = Regex("charset=([^;]+)", RegexOption.IGNORE_CASE).find(type)?.groupValues?.get(1)?.trim()
                return Result(mime, charset, bytes)
            } finally {
                connection.disconnect()
            }
        }
        throw IOException("Zu viele Weiterleitungen")
    }

    /** Kurze, lesbare Fehlerursache für die Anzeige unter der Mail. */
    fun describe(error: Throwable): String = when (error) {
        is java.net.UnknownHostException -> "Server nicht gefunden"
        is java.net.SocketTimeoutException -> "Zeitüberschreitung"
        is javax.net.ssl.SSLException -> "Sichere Verbindung fehlgeschlagen"
        else -> error.message?.takeIf { it.isNotBlank() } ?: error.javaClass.simpleName
    }
}
