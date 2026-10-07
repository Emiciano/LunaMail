package com.lunamail.app.data

import com.sun.mail.smtp.SMTPAddressFailedException
import com.sun.mail.smtp.SMTPSendFailedException
import javax.mail.Address
import javax.mail.MessagingException
import javax.mail.SendFailedException
import javax.mail.internet.AddressException
import javax.mail.internet.InternetAddress
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SendErrorsTest {
    @Test
    fun unknownRecipientNamesAddressAndCode() {
        val inner = SMTPAddressFailedException(InternetAddress("max@example.com"), "RCPT TO", 550, "550 5.1.1 User unknown")
        val outer = SendFailedException("Invalid Addresses", inner, emptyArray<Address>(), emptyArray(), arrayOf<Address>(InternetAddress("max@example.com")))
        val text = SendErrors.describe(outer)!!
        assertTrue(text.startsWith("Nicht zugestellt an max@example.com."), text)
        assertTrue(text.endsWith("Serverantwort: 550 5.1.1 User unknown"), text)
    }

    @Test
    fun tooLargeMessage() {
        val e = SMTPSendFailedException("DATA", 552, "552 5.3.4 Message size exceeds fixed limit", null, null, null, null)
        val text = SendErrors.describe(MessagingException("wrapped", e))!!
        assertTrue(text.contains("zu groß"), text)
        assertTrue(text.contains("552 5.3.4"), text)
    }

    @Test
    fun codeIsAddedWhenServerTextLacksIt() {
        val e = SMTPSendFailedException("DATA", 554, "Spam detected", null, null, null, null)
        assertTrue(SendErrors.describe(e)!!.endsWith("Serverantwort: 554 Spam detected"))
    }

    @Test
    fun invalidAddressSyntax() {
        val e = AddressException("Missing final '@domain'", "max.example.com")
        assertEquals("Die Adresse „max.example.com“ ist ungültig. Bitte Empfänger prüfen.", SendErrors.describe(e))
    }

    @Test
    fun otherErrorsAreLeftToGeneralHandling() {
        assertNull(SendErrors.describe(java.net.SocketTimeoutException("timeout")))
    }
}
