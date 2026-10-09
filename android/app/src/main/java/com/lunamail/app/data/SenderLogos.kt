package com.lunamail.app.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Logos der Absender statt Initialen. Für die Domain der Absenderadresse wird das
 * Touch-Icon der Website geladen (sonst das Favicon über DuckDuckGo) und auf dem Gerät
 * zwischengespeichert. Freemail-Adressen (Gmail, GMX …) bekommen kein Logo, dort steht
 * eine Person dahinter und das Logo des Anbieters wäre irreführend.
 */
object SenderLogos {
    private val freemail = setOf(
        "gmail.com", "googlemail.com", "gmx.de", "gmx.net", "gmx.at", "gmx.ch", "gmx.com", "web.de", "outlook.com",
        "outlook.de", "hotmail.com", "hotmail.de", "live.com", "live.de", "msn.com", "yahoo.com", "yahoo.de", "ymail.com",
        "icloud.com", "me.com", "mac.com", "t-online.de", "aol.com", "aol.de", "posteo.de", "posteo.net", "mail.de",
        "freenet.de", "proton.me", "protonmail.com", "pm.me", "online.de", "arcor.de", "vodafone.de", "mailbox.org",
        "tutanota.com", "tuta.io", "zoho.com", "yandex.com", "mail.ru",
    )
    private val secondLevel = setOf("co", "com", "org", "net", "gov", "ac", "or", "ne", "gv")

    private val memory = object : LruCache<String, Bitmap>(16 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }
    private val missing = ConcurrentHashMap.newKeySet<String>()
    private val gate = Semaphore(4)
    private const val RETRY_MS = 7L * 24 * 60 * 60 * 1000

    /** Die Domain, deren Logo für [address] gezeigt wird, oder null für Privatadressen. */
    fun domainOf(address: String): String? {
        val host = address.substringAfterLast('@', "").trim().trimEnd('>').lowercase()
        if (host.isBlank() || !host.contains('.')) return null
        val labels = host.split('.').filter { it.isNotBlank() }
        if (labels.size < 2) return null
        // Registrierbare Domain: newsletter.amazon.de → amazon.de, shop.example.co.uk → example.co.uk
        val keep = if (labels.size >= 3 && labels[labels.size - 1].length == 2 && labels[labels.size - 2] in secondLevel) 3 else 2
        val domain = labels.takeLast(keep).joinToString(".")
        return domain.takeUnless { it in freemail }
    }

    fun cached(domain: String?): Bitmap? = domain?.let { memory.get(it) }

    suspend fun load(context: Context, domain: String): Bitmap? {
        memory.get(domain)?.let { return it }
        if (domain in missing) return null
        return withContext(Dispatchers.IO) {
            gate.withPermit {
                memory.get(domain)?.let { return@withPermit it }
                val dir = File(context.cacheDir, "logos2").apply { mkdirs() }
                val file = File(dir, "$domain.png")
                val none = File(dir, "$domain.none")
                if (file.exists()) {
                    BitmapFactory.decodeFile(file.path)?.let { memory.put(domain, it); return@withPermit it }
                }
                if (none.exists() && System.currentTimeMillis() - none.lastModified() < RETRY_MS) {
                    missing += domain
                    return@withPermit null
                }
                val bitmap = fetch(domain)
                if (bitmap == null) {
                    runCatching { none.writeText("") }
                    missing += domain
                    null
                } else {
                    runCatching { file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) } }
                    none.delete()
                    memory.put(domain, bitmap)
                    bitmap
                }
            }
        }
    }

    private fun fetch(domain: String): Bitmap? {
        // Erst die großen Touch-Icons, dann was die Startseite selbst als Icon angibt, zuletzt
        // das (meist kleine) Favicon über DuckDuckGo. Genommen wird das erste ausreichend große.
        val fixed = listOf(
            "https://$domain/apple-touch-icon.png",
            "https://www.$domain/apple-touch-icon.png",
            "https://$domain/apple-touch-icon-precomposed.png",
        )
        var fallback: Bitmap? = null
        for (url in fixed + declaredIcons(domain) + "https://icons.duckduckgo.com/ip3/$domain.ico") {
            val bitmap = decode(url) ?: continue
            if (bitmap.width >= GOOD_SIZE && bitmap.height >= GOOD_SIZE) return prepare(bitmap)
            if (fallback == null || bitmap.width > fallback.width) fallback = bitmap
        }
        // Winzige Favicons würden hochskaliert nur verschwimmen; dann lieber die Initialen.
        return fallback?.takeIf { it.width >= MIN_SIZE && it.height >= MIN_SIZE }?.let(::prepare)
    }

    private fun decode(url: String): Bitmap? = runCatching {
        val image = RemoteImages.fetch(url)
        if (!image.mimeType.startsWith("image/") && !url.endsWith(".ico")) return@runCatching null
        if (image.mimeType.contains("svg")) return@runCatching null
        BitmapFactory.decodeByteArray(image.bytes, 0, image.bytes.size)
    }.getOrNull()

    private val linkTag = Regex("<link\\b[^>]*>", RegexOption.IGNORE_CASE)
    private fun attr(tag: String, name: String) =
        Regex("\\b$name\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", RegexOption.IGNORE_CASE).find(tag)
            ?.groupValues?.drop(2)?.firstOrNull { it.isNotEmpty() }

    /** Icons, die die Startseite per <link rel="…icon…"> angibt, größte zuerst (nur https). */
    private fun declaredIcons(domain: String): List<String> {
        val page = runCatching { RemoteImages.fetch("https://$domain/") }.getOrNull() ?: return emptyList()
        if (!page.mimeType.contains("html")) return emptyList()
        val html = String(page.bytes, 0, minOf(page.bytes.size, 300_000), Charsets.UTF_8)
        val base = runCatching { java.net.URI("https://$domain/") }.getOrNull() ?: return emptyList()
        return linkTag.findAll(html).mapNotNull { match ->
            val tag = match.value
            val rel = attr(tag, "rel")?.lowercase() ?: return@mapNotNull null
            if (!rel.contains("icon") || rel.contains("mask")) return@mapNotNull null
            val href = attr(tag, "href")?.replace("&amp;", "&") ?: return@mapNotNull null
            if (href.endsWith(".svg", ignoreCase = true)) return@mapNotNull null
            val url = runCatching { base.resolve(href.trim()).toString() }.getOrNull() ?: return@mapNotNull null
            if (!url.startsWith("https://")) return@mapNotNull null
            val size = attr(tag, "sizes")?.substringBefore('x')?.toIntOrNull() ?: if (rel.contains("apple")) 180 else 32
            url to size
        }.distinctBy { it.first }.sortedByDescending { it.second }.map { it.first }.take(4).toList()
    }

    /**
     * Schneidet einfarbige Ränder ab (viele Icons haben weiße oder farbige Polster), macht das
     * Bild quadratisch und bringt es auf eine feste, scharfe Größe.
     */
    private fun prepare(source: Bitmap): Bitmap {
        val bitmap = if (source.config == Bitmap.Config.ARGB_8888) source else source.copy(Bitmap.Config.ARGB_8888, false)
        val w = bitmap.width
        val h = bitmap.height
        val pixels = IntArray(w * h).also { bitmap.getPixels(it, 0, w, 0, 0, w, h) }
        val corner = pixels[0]
        fun differs(c: Int): Boolean {
            val a1 = c ushr 24
            val a0 = corner ushr 24
            if (a0 < 16 && a1 < 16) return false
            return Math.abs(a1 - a0) > 24 ||
                Math.abs((c shr 16 and 0xFF) - (corner shr 16 and 0xFF)) > 24 ||
                Math.abs((c shr 8 and 0xFF) - (corner shr 8 and 0xFF)) > 24 ||
                Math.abs((c and 0xFF) - (corner and 0xFF)) > 24
        }
        var left = w; var top = h; var right = -1; var bottom = -1
        for (y in 0 until h) for (x in 0 until w) {
            if (differs(pixels[y * w + x])) {
                if (x < left) left = x
                if (x > right) right = x
                if (y < top) top = y
                if (y > bottom) bottom = y
            }
        }
        val out = Bitmap.createBitmap(OUT_SIZE, OUT_SIZE, Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(out)
        // Hintergrund in der Randfarbe, damit nichts wie ein Rahmen aussieht.
        val opaqueCorner = (corner ushr 24) >= 200
        canvas.drawColor(if (opaqueCorner) corner or (0xFF shl 24) else android.graphics.Color.WHITE)
        val paint = android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG or android.graphics.Paint.ANTI_ALIAS_FLAG)
        if (right < 0) {
            canvas.drawBitmap(bitmap, null, android.graphics.Rect(0, 0, OUT_SIZE, OUT_SIZE), paint)
            return out
        }
        val contentW = right - left + 1
        val contentH = bottom - top + 1
        // Hatte das Icon kaum Rand, füllt es die Kachel; sonst bekommt das Motiv etwas Luft.
        val trimmed = contentW < w * 0.9f || contentH < h * 0.9f
        val target = if (trimmed) OUT_SIZE * 0.78f else OUT_SIZE.toFloat()
        val scale = target / maxOf(contentW, contentH)
        val dw = contentW * scale
        val dh = contentH * scale
        val dx = (OUT_SIZE - dw) / 2f
        val dy = (OUT_SIZE - dh) / 2f
        canvas.drawBitmap(
            bitmap,
            android.graphics.Rect(left, top, right + 1, bottom + 1),
            android.graphics.RectF(dx, dy, dx + dw, dy + dh),
            paint,
        )
        return out
    }

    private const val GOOD_SIZE = 96
    private const val MIN_SIZE = 48
    private const val OUT_SIZE = 192
}
