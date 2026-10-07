package com.lunamail.app.data

import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.net.URLDecoder

/** Servereinstellungen, die aus einem QR-Code oder einer Konfigurationsdatei gelesen wurden. */
data class AccountConfig(
    val email: String = "",
    val displayName: String = "",
    val description: String = "",
    val imapHost: String = "",
    val imapPort: Int = 993,
    val imapSecurity: Security = Security.SSL,
    val username: String = "",
    val password: String = "",
    val smtpHost: String = "",
    val smtpPort: Int = 587,
    val smtpSecurity: Security = Security.STARTTLS,
    /** Gesetzt, wenn nur POP3 angeboten wird – LunaMail braucht IMAP. */
    val popOnly: Boolean = false,
)

class AccountConfigException(message: String) : Exception(message)

/**
 * Liest Kontoeinstellungen aus dem Inhalt eines QR-Codes. Hoster wie Plesk, cPanel oder
 * Hostinger codieren meist einen Link auf ein Apple-Konfigurationsprofil (.mobileconfig);
 * unterstützt werden außerdem Thunderbird-Autoconfig-XML, imap://-Links und einfache
 * „Schlüssel: Wert“-Texte.
 */
object AccountConfigParser {

    /** Wertet den QR-Inhalt aus und lädt bei Bedarf die verlinkte Konfiguration (blockierend). */
    fun resolve(qrContent: String, fetch: (String) -> String = ::download): AccountConfig {
        val content = qrContent.trim()
        val lower = content.lowercase()
        val config = when {
            lower.startsWith("http://") || lower.startsWith("https://") -> parseDocument(fetch(content))
            else -> parse(content)
        }
        return config ?: throw AccountConfigException("Dieser QR-Code enthält keine E-Mail-Einstellungen.")
    }

    fun parse(content: String): AccountConfig? {
        val text = content.trim()
        val lower = text.lowercase()
        return when {
            lower.startsWith("imap://") || lower.startsWith("imaps://") -> parseImapUri(text)
            lower.startsWith("mailto:") -> AccountConfig(email = text.removePrefix("mailto:").substringBefore('?'))
            text.contains("<plist") || text.contains("<clientConfig") -> parseDocument(text)
            else -> parseKeyValues(text)
        }?.normalized()
    }

    fun parseDocument(document: String): AccountConfig? = when {
        document.contains("<plist") -> parseMobileConfig(document)
        document.contains("<clientConfig") -> parseAutoconfig(document)
        else -> parseKeyValues(document)
    }?.normalized()

    /** Apple-Konfigurationsprofil, auch signiert (der Klartext-Plist steckt im PKCS#7-Container). */
    fun parseMobileConfig(document: String): AccountConfig? {
        val plist = Regex("(?s)<plist.*?</plist>").find(document)?.value ?: return null
        val values = mutableMapOf<String, String>()
        Regex("(?s)<key>\\s*([^<]+?)\\s*</key>\\s*(?:<(string|integer)>(.*?)</\\2>|<(true|false)\\s*/>)")
            .findAll(plist)
            .forEach { match ->
                val key = match.groupValues[1]
                val value = match.groupValues[3].ifEmpty { match.groupValues[4] }
                // Das erste Vorkommen gewinnt, damit spätere Payloads nichts überschreiben.
                values.putIfAbsent(key, xmlUnescape(value.trim()))
            }
        val incoming = values["IncomingMailServerHostName"] ?: return null
        val pop = values["EmailAccountType"]?.contains("POP", ignoreCase = true) == true
        val imapPort = values["IncomingMailServerPortNumber"]?.toIntOrNull()
        val smtpPort = values["OutgoingMailServerPortNumber"]?.toIntOrNull()
        val imapSsl = values["IncomingMailServerUseSSL"]?.toBoolean() ?: true
        val smtpSsl = values["OutgoingMailServerUseSSL"]?.toBoolean() ?: true
        return AccountConfig(
            email = values["EmailAddress"].orEmpty(),
            displayName = values["EmailAccountName"].orEmpty(),
            description = values["EmailAccountDescription"].orEmpty(),
            imapHost = incoming,
            imapPort = imapPort ?: if (imapSsl) 993 else 143,
            imapSecurity = securityFor(imapPort ?: 993, imapSsl, implicitPort = 993),
            username = values["IncomingMailServerUsername"].orEmpty(),
            password = values["IncomingPassword"].orEmpty(),
            smtpHost = values["OutgoingMailServerHostName"].orEmpty(),
            smtpPort = smtpPort ?: 587,
            smtpSecurity = securityFor(smtpPort ?: 587, smtpSsl, implicitPort = 465),
            popOnly = pop,
        )
    }

    /** Thunderbird-Autoconfig (config-v1.1.xml). */
    fun parseAutoconfig(document: String): AccountConfig? {
        fun server(tag: String, type: String): Map<String, String>? {
            val block = Regex("(?s)<$tag[^>]*type=\"$type\"[^>]*>(.*?)</$tag>").find(document)?.groupValues?.get(1)
                ?: return null
            return listOf("hostname", "port", "socketType", "username").associateWith { name ->
                Regex("<$name>\\s*([^<]*?)\\s*</$name>").find(block)?.groupValues?.get(1).orEmpty()
            }
        }
        val imap = server("incomingServer", "imap")
        val pop = server("incomingServer", "pop3")
        val smtp = server("outgoingServer", "smtp")
        val incoming = imap ?: pop ?: return null
        fun security(socket: String?, port: Int) = when (socket?.uppercase()) {
            "SSL", "TLS" -> Security.SSL
            "STARTTLS" -> Security.STARTTLS
            "PLAIN" -> Security.NONE
            else -> if (port == 993 || port == 465) Security.SSL else Security.STARTTLS
        }
        val imapPort = incoming["port"]?.toIntOrNull() ?: 993
        val smtpPort = smtp?.get("port")?.toIntOrNull() ?: 587
        return AccountConfig(
            displayName = Regex("<displayName>\\s*([^<]*?)\\s*</displayName>").find(document)?.groupValues?.get(1).orEmpty(),
            imapHost = incoming["hostname"].orEmpty(),
            imapPort = imapPort,
            imapSecurity = security(incoming["socketType"], imapPort),
            username = incoming["username"].orEmpty().takeUnless { it.startsWith("%") }.orEmpty(),
            smtpHost = smtp?.get("hostname").orEmpty(),
            smtpPort = smtpPort,
            smtpSecurity = security(smtp?.get("socketType"), smtpPort),
            popOnly = imap == null,
        )
    }

    private fun parseImapUri(text: String): AccountConfig? {
        val uri = runCatching { URI(text) }.getOrNull() ?: return null
        val host = uri.host ?: return null
        val secure = uri.scheme.equals("imaps", true)
        val port = if (uri.port > 0) uri.port else if (secure) 993 else 143
        val userInfo = uri.rawUserInfo.orEmpty()
        val user = decode(userInfo.substringBefore(':'))
        val password = if (userInfo.contains(':')) decode(userInfo.substringAfter(':')) else ""
        return AccountConfig(
            email = user.takeIf { it.contains('@') }.orEmpty(),
            imapHost = host,
            imapPort = port,
            imapSecurity = securityFor(port, secure || port == 993, implicitPort = 993),
            username = user,
            password = password,
        )
    }

    /** Freier Text wie „IMAP-Server: mail.example.de“, auch mit „=“ oder „;“ getrennt. */
    fun parseKeyValues(text: String): AccountConfig? {
        val pairs = text.split('\n', ';', '&')
            .mapNotNull { line ->
                val index = line.indexOfAny(charArrayOf(':', '='))
                if (index <= 0) null else line.substring(0, index).trim().lowercase() to line.substring(index + 1).trim()
            }
            .filter { it.second.isNotEmpty() }
        if (pairs.isEmpty()) return null

        fun find(vararg patterns: Regex): String? =
            pairs.firstOrNull { (key, _) -> patterns.all { it.containsMatchIn(key) } }?.second

        val incomingKey = Regex("imap|incoming|eingang|posteingang|pop")
        val outgoingKey = Regex("smtp|outgoing|ausgang|postausgang")
        val hostKey = Regex("server|host")
        val portKey = Regex("port")

        val imapHost = find(Regex("imap"), hostKey) ?: find(incomingKey, hostKey)
            ?: pairs.firstOrNull { (key, _) -> hostKey.containsMatchIn(key) && !outgoingKey.containsMatchIn(key) }?.second
            ?: return null
        val smtpHost = find(outgoingKey, hostKey).orEmpty()
        val imapPort = find(incomingKey, portKey)?.filter(Char::isDigit)?.toIntOrNull() ?: 993
        val smtpPort = find(outgoingKey, portKey)?.filter(Char::isDigit)?.toIntOrNull() ?: 587
        val email = find(Regex("e-?mail|adresse|address")) ?: pairs.firstOrNull { it.second.contains('@') && !it.second.contains(' ') }?.second.orEmpty()
        return AccountConfig(
            email = email,
            imapHost = imapHost,
            imapPort = imapPort,
            imapSecurity = if (imapPort == 143) Security.STARTTLS else Security.SSL,
            username = find(Regex("user|benutzer|login|anmelde")).orEmpty(),
            password = find(Regex("pass|kennwort")).orEmpty(),
            smtpHost = smtpHost,
            smtpPort = smtpPort,
            smtpSecurity = if (smtpPort == 465) Security.SSL else Security.STARTTLS,
            popOnly = pairs.any { "pop" in it.first } && pairs.none { "imap" in it.first },
        )
    }

    private fun AccountConfig.normalized(): AccountConfig {
        val user = username.ifBlank { email }
        val host = imapHost.trim()
        return copy(
            email = email.ifBlank { user.takeIf { it.contains('@') }.orEmpty() },
            username = user,
            imapHost = host,
            // Ohne Angabe ist der Ausgangsserver meist smtp.<domain> oder derselbe Host.
            smtpHost = smtpHost.trim().ifBlank { if (host.startsWith("imap.")) "smtp." + host.removePrefix("imap.") else host },
        )
    }

    /** Apple kennt nur „SSL verwenden“; das bedeutet je nach Port implizites TLS oder STARTTLS. */
    private fun securityFor(port: Int, useSsl: Boolean, implicitPort: Int): Security = when {
        !useSsl -> Security.NONE
        port == implicitPort || port == 993 || port == 465 -> Security.SSL
        else -> Security.STARTTLS
    }

    private fun xmlUnescape(value: String) = value
        .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")

    private fun decode(value: String) = runCatching { URLDecoder.decode(value, "UTF-8") }.getOrDefault(value)

    fun download(url: String): String {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 15_000
        connection.instanceFollowRedirects = true
        connection.setRequestProperty("Accept", "application/x-apple-aspen-config, application/xml, text/xml, */*")
        try {
            if (connection.responseCode !in 200..299) {
                throw AccountConfigException("Die Konfiguration konnte nicht geladen werden (HTTP ${connection.responseCode}).")
            }
            val bytes = connection.inputStream.use { it.readBytes() }
            if (bytes.size > 2_000_000) throw AccountConfigException("Die Konfigurationsdatei ist zu groß.")
            // Signierte Profile sind binär; ISO-8859-1 hält jedes Byte, der XML-Teil bleibt lesbar.
            val latin = String(bytes, Charsets.ISO_8859_1)
            val start = latin.indexOf("<?xml").takeIf { it >= 0 } ?: latin.indexOf("<plist").takeIf { it >= 0 } ?: 0
            val end = latin.lastIndexOf("</plist>").takeIf { it >= 0 }?.plus("</plist>".length) ?: bytes.size
            return String(bytes, start, end - start, Charsets.UTF_8)
        } finally {
            connection.disconnect()
        }
    }
}
