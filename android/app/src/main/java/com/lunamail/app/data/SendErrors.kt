package com.lunamail.app.data

import com.sun.mail.smtp.SMTPAddressFailedException
import com.sun.mail.smtp.SMTPSendFailedException
import javax.mail.MessagingException
import javax.mail.SendFailedException
import javax.mail.internet.AddressException

/**
 * Übersetzt Fehler beim Senden in verständliche Meldungen, jeweils mit dem Fehlercode
 * und der Antwort des Servers, damit man sieht, warum eine E-Mail nicht rausging.
 */
object SendErrors {
    fun describe(error: Throwable): String? {
        val chain = generateSequence(error) { (it as? MessagingException)?.nextException ?: it.cause }.take(10).toList()

        chain.filterIsInstance<AddressException>().firstOrNull()?.let { e ->
            val address = e.ref?.takeIf { it.isNotBlank() }
            return if (address != null) "Die Adresse „$address“ ist ungültig. Bitte Empfänger prüfen."
            else "Eine Empfängeradresse ist ungültig. Bitte Empfänger prüfen."
        }

        val rejected = chain.filterIsInstance<SMTPAddressFailedException>()
        if (rejected.isNotEmpty()) {
            val first = rejected.first()
            val addresses = rejected.map { it.address.toString() }.distinct().joinToString(", ")
            val reason = when (first.returnCode) {
                550, 551, 553 -> "Das Postfach existiert nicht oder nimmt keine E-Mails an."
                552 -> "Das Postfach des Empfängers ist voll."
                in 400..499 -> "Der Empfänger ist gerade nicht erreichbar. Bitte später erneut senden."
                else -> "Der Server hat diesen Empfänger abgelehnt."
            }
            return "Nicht zugestellt an $addresses. $reason" + serverReply(first.returnCode, first.message)
        }

        chain.filterIsInstance<SMTPSendFailedException>().firstOrNull()?.let { e ->
            val code = e.returnCode
            val reason = when {
                code == 530 || code == 535 || code == 534 -> "Der Server hat die Anmeldung abgelehnt. Bitte Passwort prüfen."
                code == 552 -> "Die E-Mail ist zu groß für den Server. Bitte Anhänge verkleinern."
                code == 554 -> "Der Server hat die E-Mail abgelehnt, zum Beispiel als Spam."
                code == 550 || code == 553 -> "Der Server hat den Absender abgelehnt. Bitte das Konto prüfen."
                code in 400..499 -> "Der Server ist gerade nicht bereit. Bitte später erneut senden."
                else -> "Der Server hat die E-Mail nicht angenommen."
            }
            return "Die E-Mail wurde nicht gesendet. $reason" + serverReply(code, e.message)
        }

        chain.filterIsInstance<SendFailedException>().firstOrNull()?.let { e ->
            val invalid = e.invalidAddresses.orEmpty().map { it.toString() }
            if (invalid.isNotEmpty()) return "Ungültige Empfänger: ${invalid.joinToString(", ")}. Bitte Adressen prüfen."
        }
        return null
    }

    /** Hängt die Serverantwort an, z. B. „Serverantwort: 550 5.1.1 User unknown“. */
    private fun serverReply(code: Int, message: String?): String {
        val text = message?.lines()?.firstOrNull { it.isNotBlank() }?.trim().orEmpty()
        val withCode = if (code > 0 && !text.startsWith(code.toString())) "$code $text".trim() else text
        return if (withCode.isBlank()) "" else "\n\nServerantwort: ${withCode.take(200)}"
    }
}
