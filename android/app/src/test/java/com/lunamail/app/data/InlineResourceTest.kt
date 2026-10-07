package com.lunamail.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InlineResourceTest {
    private val png = byteArrayOf(1, 2, 3)

    @Test
    fun cleansFoldedContentIds() {
        assertEquals("logo@mail.example", MailClient.cleanContentId("<logo@mail.example>"))
        assertEquals("logo@mail.example", MailClient.cleanContentId("\r\n <logo@mail.example>"))
        assertEquals("plain", MailClient.cleanContentId(" plain "))
    }

    @Test
    fun embedsCidCaseInsensitivelyAndUrlEncoded() {
        val html = """<img src="CID:logo@mail.example" alt="a"><img src='cid:logo%40mail.example'>"""
        val result = MailClient.embedResources(html, listOf(MailClient.InlineResource("logo@mail.example", null, "logo.png", "image/png", png)))
        assertFalse(result.contains("cid:", ignoreCase = true))
        assertEquals(2, Regex("data:image/png;base64,AQID").findAll(result).count())
    }

    @Test
    fun guessesImageTypeForOctetStream() {
        val html = """<img src="cid:a1">"""
        val result = MailClient.embedResources(html, listOf(MailClient.InlineResource("a1", null, "Logo.JPG", "application/octet-stream", png)))
        assertTrue(result.contains("data:image/jpeg;base64,"))
    }

    @Test
    fun embedsByContentLocation() {
        val html = """<img src="images/logo.png" alt="Claude">"""
        val result = MailClient.embedResources(html, listOf(MailClient.InlineResource(null, "images/logo.png", null, "image/png", png)))
        assertEquals("""<img src="data:image/png;base64,AQID" alt="Claude">""", result)
    }

    @Test
    fun doesNotTouchLongerCidsWithSamePrefix() {
        val html = """<img src="cid:a1"><img src="cid:a10">"""
        val result = MailClient.embedResources(html, listOf(MailClient.InlineResource("a1", null, null, "image/png", png)))
        assertTrue(result.contains("cid:a10"))
    }

    @Test
    fun detectsReferences() {
        val html = """<img src="cid:logo%40mail.example"><img src="pic.png">""".lowercase()
        assertTrue(MailClient.isReferenced(html, "Logo@mail.example", null))
        assertTrue(MailClient.isReferenced(html, null, "pic.png"))
        assertFalse(MailClient.isReferenced(html, "photo@iphone", null))
    }
}
