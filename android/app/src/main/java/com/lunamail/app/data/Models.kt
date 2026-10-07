package com.lunamail.app.data

import kotlinx.serialization.Serializable

@Serializable
enum class Security { SSL, STARTTLS, NONE }

@Serializable
data class Account(
    val id: String,
    val displayName: String,
    val description: String,
    val email: String,
    val provider: String,
    val imapHost: String,
    val imapPort: Int,
    val imapSecurity: Security,
    val smtpHost: String,
    val smtpPort: Int,
    val smtpSecurity: Security,
    val username: String,
) {
    /** Provider, die gesendete Nachrichten selbst im Gesendet-Ordner ablegen. */
    val serverStoresSentMail: Boolean
        get() = smtpHost.endsWith("gmail.com") || smtpHost.endsWith("googlemail.com")
}

@Serializable
enum class MailboxRole { INBOX, DRAFTS, SENT, ARCHIVE, ALL, JUNK, TRASH, OTHER }

@Serializable
data class Mailbox(
    val accountId: String,
    val fullName: String,
    val displayName: String,
    val role: MailboxRole,
    val unread: Int = 0,
    val total: Int = 0,
) {
    val ref get() = BoxRef(accountId, fullName)
}

/** Verweist auf ein Postfach. [accountId] == [BoxRef.ALL] steht für „Alle Eingänge“. */
@Serializable
data class BoxRef(val accountId: String, val folder: String) {
    val isUnified get() = accountId == ALL
    val isSmart get() = isUnified && folder != "INBOX"
    val key get() = "$accountId|$folder"

    companion object {
        const val ALL = "*"
        val UnifiedInbox = BoxRef(ALL, "INBOX")
        val Flagged = BoxRef(ALL, "FLAGGED")
        val Unread = BoxRef(ALL, "UNREAD")
    }
}

@Serializable
data class MessageSummary(
    val accountId: String,
    val folder: String,
    val uid: Long,
    val messageId: String = "",
    val fromName: String,
    val fromAddress: String,
    val to: String = "",
    val subject: String,
    val preview: String? = null,
    val date: Long,
    val seen: Boolean,
    val flagged: Boolean,
    val answered: Boolean = false,
    val hasAttachments: Boolean = false,
) {
    val key get() = "$accountId|$folder|$uid"
    val box get() = BoxRef(accountId, folder)
    val senderLabel get() = fromName.ifBlank { fromAddress }.ifBlank { "Unbekannt" }
}

@Serializable
data class AttachmentInfo(val fileName: String, val mimeType: String, val size: Int, val index: Int = 0)

@Serializable
data class MessageBody(
    val html: String? = null,
    val text: String? = null,
    val to: String = "",
    val cc: String = "",
    val replyTo: String = "",
    val references: String = "",
    val attachments: List<AttachmentInfo> = emptyList(),
)

data class Draft(
    val accountId: String,
    val to: String,
    val cc: String = "",
    val bcc: String = "",
    val subject: String,
    val body: String,
    val inReplyTo: String? = null,
    val references: String? = null,
)
