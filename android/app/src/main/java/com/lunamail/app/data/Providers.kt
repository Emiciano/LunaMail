package com.lunamail.app.data

data class MailProvider(
    val id: String,
    val name: String,
    val imapHost: String,
    val imapPort: Int = 993,
    val imapSecurity: Security = Security.SSL,
    val smtpHost: String,
    val smtpPort: Int,
    val smtpSecurity: Security,
    val hint: String? = null,
)

object Providers {
    val all = listOf(
        MailProvider(
            id = "icloud",
            name = "iCloud",
            imapHost = "imap.mail.me.com",
            smtpHost = "smtp.mail.me.com",
            smtpPort = 587,
            smtpSecurity = Security.STARTTLS,
            hint = "Verwende ein app-spezifisches Passwort von account.apple.com.",
        ),
        MailProvider(
            id = "google",
            name = "Google",
            imapHost = "imap.gmail.com",
            smtpHost = "smtp.gmail.com",
            smtpPort = 465,
            smtpSecurity = Security.SSL,
            hint = "Google erfordert ein App-Passwort (Google-Konto > Sicherheit > App-Passwörter).",
        ),
        MailProvider(
            id = "gmx",
            name = "GMX",
            imapHost = "imap.gmx.net",
            smtpHost = "mail.gmx.net",
            smtpPort = 587,
            smtpSecurity = Security.STARTTLS,
            hint = "IMAP muss in den GMX-Einstellungen unter POP3/IMAP aktiviert sein.",
        ),
        MailProvider(
            id = "webde",
            name = "WEB.DE",
            imapHost = "imap.web.de",
            smtpHost = "smtp.web.de",
            smtpPort = 587,
            smtpSecurity = Security.STARTTLS,
            hint = "IMAP muss in den WEB.DE-Einstellungen unter POP3/IMAP aktiviert sein.",
        ),
        MailProvider(
            id = "tonline",
            name = "T-Online",
            imapHost = "secureimap.t-online.de",
            smtpHost = "securesmtp.t-online.de",
            smtpPort = 465,
            smtpSecurity = Security.SSL,
            hint = "Verwende das E-Mail-Passwort aus dem Telekom-Kundencenter.",
        ),
        MailProvider(
            id = "ionos",
            name = "IONOS",
            imapHost = "imap.ionos.de",
            smtpHost = "smtp.ionos.de",
            smtpPort = 465,
            smtpSecurity = Security.SSL,
        ),
        MailProvider(
            id = "hypnotic",
            name = "Hypnotic One",
            imapHost = "hypnotic.one",
            smtpHost = "hypnotic.one",
            smtpPort = 465,
            smtpSecurity = Security.SSL,
            hint = "Benutzername ist deine vollständige E-Mail-Adresse.",
        ),
        MailProvider(
            id = "yahoo",
            name = "Yahoo!",
            imapHost = "imap.mail.yahoo.com",
            smtpHost = "smtp.mail.yahoo.com",
            smtpPort = 465,
            smtpSecurity = Security.SSL,
            hint = "Yahoo erfordert ein App-Passwort.",
        ),
    )

    fun byId(id: String) = all.firstOrNull { it.id == id }

    /** Erkennt bekannte Anbieter anhand der Domain der E-Mail-Adresse. */
    fun guess(email: String): MailProvider? {
        val domain = email.substringAfter('@', "").lowercase()
        return when (domain) {
            "icloud.com", "me.com", "mac.com" -> byId("icloud")
            "gmail.com", "googlemail.com" -> byId("google")
            "gmx.de", "gmx.net", "gmx.at", "gmx.ch" -> byId("gmx")
            "web.de" -> byId("webde")
            "t-online.de" -> byId("tonline")
            "yahoo.com", "yahoo.de" -> byId("yahoo")
            else -> null
        }
    }
}
