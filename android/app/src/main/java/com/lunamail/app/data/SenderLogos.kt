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

    private val memory = object : LruCache<String, Bitmap>(8 * 1024 * 1024) {
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
                val dir = File(context.cacheDir, "logos").apply { mkdirs() }
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
        val candidates = listOf(
            "https://$domain/apple-touch-icon.png",
            "https://www.$domain/apple-touch-icon.png",
            "https://icons.duckduckgo.com/ip3/$domain.ico",
        )
        for (url in candidates) {
            val bitmap = runCatching {
                val image = RemoteImages.fetch(url)
                if (!image.mimeType.startsWith("image/") && !url.endsWith(".ico")) return@runCatching null
                BitmapFactory.decodeByteArray(image.bytes, 0, image.bytes.size)
            }.getOrNull()
            if (bitmap != null && bitmap.width >= 16 && bitmap.height >= 16) {
                return if (bitmap.width > 128) Bitmap.createScaledBitmap(bitmap, 128, 128 * bitmap.height / bitmap.width, true) else bitmap
            }
        }
        return null
    }
}
