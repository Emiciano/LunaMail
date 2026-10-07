package com.lunamail.app.data

import org.junit.Assert.assertEquals
import org.junit.Test

class MailboxRolesTest {
    private fun box(name: String, total: Int = 0) =
        Mailbox("a", name, MailClient.displayName(name, name, MailClient.inferRole(name, emptyList())), MailClient.inferRole(name, emptyList()), total = total)

    @Test
    fun serverMarkedSentFolderWinsOverNameMatch() {
        val result = MailClient.resolveRoleConflicts(listOf(box("INBOX"), box("Sent", 5), box("Gesendet", 50)), serverMarked = setOf("Sent"))
        assertEquals(listOf(MailboxRole.INBOX, MailboxRole.SENT, MailboxRole.OTHER), result.map { it.role })
        assertEquals(listOf("Eingang", "Gesendet", "Gesendet"), result.map { it.displayName })
        assertEquals("Sent", result.single { it.role == MailboxRole.SENT }.fullName)
    }

    @Test
    fun withoutMarkerTheFullerFolderWinsAndTheOtherKeepsItsName() {
        val result = MailClient.resolveRoleConflicts(listOf(box("INBOX.Sent", 3), box("INBOX.Sent Items", 40)), serverMarked = emptySet())
        assertEquals("INBOX.Sent Items", result.single { it.role == MailboxRole.SENT }.fullName)
        assertEquals("Sent", result.single { it.role == MailboxRole.OTHER }.displayName)
    }

    @Test
    fun uniqueRolesStayUntouched() {
        val boxes = listOf(box("INBOX"), box("Drafts"), box("Sent"), box("Trash"), box("Projekte"))
        assertEquals(boxes, MailClient.resolveRoleConflicts(boxes, emptySet()))
    }
}
