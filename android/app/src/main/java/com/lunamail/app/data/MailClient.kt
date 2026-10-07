package com.lunamail.app.data

import com.sun.mail.imap.IMAPFolder
import com.sun.mail.imap.IMAPMessage
import com.sun.mail.imap.IMAPStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.util.Base64
import java.util.Date
import java.util.Properties
import javax.mail.Address
import javax.mail.FetchProfile
import javax.mail.Flags
import javax.mail.Folder
import javax.mail.Message
import javax.mail.MessagingException
import javax.mail.Multipart
import javax.mail.Part
import javax.mail.Session
import javax.mail.UIDFolder
import javax.mail.internet.InternetAddress
import javax.mail.internet.MimeMessage
import javax.mail.internet.MimeUtility

class ServerCheckException(val server: String, cause: Throwable) : Exception(cause.message, cause)

/**
 * IMAP/SMTP-Zugriff für ein Konto. Alle Aufrufe laufen nacheinander über eine
 * gemeinsame IMAP-Verbindung, die bei Bedarf neu aufgebaut wird.
 */
class MailClient(private val account: Account, private val password: String) {
    private val mutex = Mutex()
    private val socketFactory = MultiAddressSocketFactory()
    private var store: IMAPStore? = null

    private fun imapSession(): Session {
        val protocol = if (account.imapSecurity == Security.SSL) "imaps" else "imap"
        val props = Properties().apply {
            put("mail.store.protocol", protocol)
            put("mail.$protocol.host", account.imapHost)
            put("mail.$protocol.port", account.imapPort.toString())
            put("mail.$protocol.connectiontimeout", "15000")
            put("mail.$protocol.timeout", "30000")
            put("mail.$protocol.peek", "true")
            put("mail.$protocol.partialfetch", "false")
            if (account.imapSecurity == Security.SSL) {
                put("mail.$protocol.ssl.checkserveridentity", "true")
            }
            if (account.imapSecurity == Security.STARTTLS) {
                put("mail.$protocol.starttls.enable", "true")
                put("mail.$protocol.starttls.required", "true")
                put("mail.$protocol.ssl.checkserveridentity", "true")
            }
            put("mail.mime.address.strict", "false")
            put("mail.$protocol.socketFactory", socketFactory)
            put("mail.$protocol.socketFactory.fallback", "false")
        }
        return Session.getInstance(props)
    }

    private fun smtpSession(): Session {
        val props = Properties().apply {
            put("mail.smtp.host", account.smtpHost)
            put("mail.smtp.port", account.smtpPort.toString())
            put("mail.smtp.auth", "true")
            put("mail.smtp.connectiontimeout", "15000")
            put("mail.smtp.timeout", "30000")
            put("mail.smtp.writetimeout", "30000")
            put("mail.smtp.socketFactory", socketFactory)
            put("mail.smtp.socketFactory.fallback", "false")
            when (account.smtpSecurity) {
                Security.SSL -> {
                    put("mail.smtp.ssl.enable", "true")
                    put("mail.smtp.ssl.checkserveridentity", "true")
                }
                Security.STARTTLS -> {
                    put("mail.smtp.starttls.enable", "true")
                    put("mail.smtp.starttls.required", "true")
                    put("mail.smtp.ssl.checkserveridentity", "true")
                }
                Security.NONE -> Unit
            }
        }
        return Session.getInstance(props)
    }

    private fun connectedStore(): IMAPStore {
        store?.let { if (it.isConnected) return it }
        runCatching { store?.close() }
        val session = imapSession()
        val s = session.getStore(if (account.imapSecurity == Security.SSL) "imaps" else "imap") as IMAPStore
        s.connect(account.imapHost, account.imapPort, account.username, password)
        store = s
        return s
    }

    private suspend fun <T> withStore(block: (IMAPStore) -> T): T = mutex.withLock {
        withContext(Dispatchers.IO) {
            try {
                block(connectedStore())
            } catch (e: MessagingException) {
                // Verbindungen werden vom Server gerne still geschlossen: dann einmal neu verbinden.
                val dropped = e is javax.mail.FolderClosedException || e is javax.mail.StoreClosedException ||
                    runCatching { store?.isConnected != true }.getOrDefault(true)
                if (!dropped || e is javax.mail.AuthenticationFailedException) throw e
                runCatching { store?.close() }
                store = null
                block(connectedStore())
            }
        }
    }

    private fun <T> IMAPStore.withFolder(name: String, mode: Int, block: (IMAPFolder) -> T): T {
        val folder = getFolder(name) as IMAPFolder
        folder.open(mode)
        try {
            return block(folder)
        } finally {
            if (folder.isOpen) runCatching { folder.close(false) }
        }
    }

    /** Prüft Posteingangs- und Postausgangsserver; Fehler nennen den betroffenen Server. */
    suspend fun test() {
        try {
            withStore { it.defaultFolder.list("%") }
        } catch (e: Exception) {
            throw ServerCheckException("Posteingang (${account.imapHost}:${account.imapPort})", e)
        }
        try {
            withContext(Dispatchers.IO) {
                val transport = smtpSession().getTransport("smtp")
                transport.connect(account.smtpHost, account.smtpPort, account.username, password)
                transport.close()
            }
        } catch (e: Exception) {
            throw ServerCheckException("Postausgang (${account.smtpHost}:${account.smtpPort})", e)
        }
    }

    suspend fun listMailboxes(): List<Mailbox> = withStore { store ->
        store.defaultFolder.list("*")
            .filterIsInstance<IMAPFolder>()
            .mapNotNull { folder ->
                val attributes = runCatching { folder.attributes.toList() }.getOrDefault(emptyList())
                if (attributes.any { it.equals("\\Noselect", true) || it.equals("\\NonExistent", true) }) return@mapNotNull null
                if (folder.type and Folder.HOLDS_MESSAGES == 0) return@mapNotNull null
                val role = inferRole(folder.fullName, attributes)
                val unread = runCatching { folder.unreadMessageCount }.getOrDefault(0)
                val total = runCatching { folder.messageCount }.getOrDefault(0)
                Mailbox(
                    accountId = account.id,
                    fullName = folder.fullName,
                    displayName = displayName(folder.fullName, folder.name, role),
                    role = role,
                    unread = maxOf(unread, 0),
                    total = maxOf(total, 0),
                )
            }
    }

    /** Lädt die neuesten [limit] Nachrichten, wobei die neuesten [skip] übersprungen werden. */
    suspend fun fetchMessages(folderName: String, limit: Int = PAGE_SIZE, skip: Int = 0): List<MessageSummary> = withStore { store ->
        store.withFolder(folderName, Folder.READ_ONLY) { folder ->
            val end = folder.messageCount - skip
            if (end <= 0) return@withFolder emptyList()
            val messages = folder.getMessages(maxOf(1, end - limit + 1), end)
            val profile = FetchProfile().apply {
                add(FetchProfile.Item.ENVELOPE)
                add(FetchProfile.Item.FLAGS)
                add(FetchProfile.Item.CONTENT_INFO)
                add(UIDFolder.FetchProfileItem.UID)
            }
            folder.fetch(messages, profile)
            messages.map { message ->
                val from = message.from?.firstOrNull() as? InternetAddress
                MessageSummary(
                    accountId = account.id,
                    folder = folderName,
                    uid = folder.getUID(message),
                    messageId = (message as? IMAPMessage)?.messageID.orEmpty(),
                    fromName = from?.personal.orEmpty(),
                    fromAddress = from?.address.orEmpty(),
                    to = formatAddresses(message.getRecipients(Message.RecipientType.TO)),
                    subject = message.subject.orEmpty(),
                    date = (message.receivedDate ?: message.sentDate ?: Date()).time,
                    seen = message.isSet(Flags.Flag.SEEN),
                    flagged = message.isSet(Flags.Flag.FLAGGED),
                    answered = message.isSet(Flags.Flag.ANSWERED),
                    hasAttachments = runCatching { hasAttachments(message) }.getOrDefault(false),
                )
            }.sortedByDescending { it.date }
        }
    }

    /** Lädt Vorschautexte für die angegebenen UIDs. */
    suspend fun fetchPreviews(folderName: String, uids: List<Long>): Map<Long, String> = withStore { store ->
        store.withFolder(folderName, Folder.READ_ONLY) { folder ->
            val messages = folder.getMessagesByUID(uids.toLongArray()).filterNotNull().toTypedArray()
            folder.fetch(messages, FetchProfile().apply {
                add(FetchProfile.Item.CONTENT_INFO)
                add(UIDFolder.FetchProfileItem.UID)
            })
            messages.associate { message ->
                val preview = runCatching {
                    val text = findText(message, "text/plain")
                        ?: findText(message, "text/html")?.let(::htmlToText)
                    text.orEmpty().replace(Regex("\\s+"), " ").trim().take(240)
                }.getOrDefault("")
                folder.getUID(message) to preview
            }
        }
    }

    suspend fun fetchBody(folderName: String, uid: Long): MessageBody = withStore { store ->
        store.withFolder(folderName, Folder.READ_ONLY) { folder ->
            val message = folder.getMessageByUID(uid) ?: throw MessagingException("Nachricht nicht mehr vorhanden")
            val collector = BodyCollector()
            collector.walk(message)
            val html = collector.html?.let { source ->
                collector.inline.entries.fold(source) { acc, (cid, dataUri) ->
                    acc.replace(Regex("cid:" + Regex.escape(cid), RegexOption.IGNORE_CASE), Regex.escapeReplacement(dataUri))
                }
            }
            MessageBody(
                formatVersion = BODY_FORMAT,
                html = html,
                text = collector.text,
                to = formatAddresses(message.getRecipients(Message.RecipientType.TO)),
                cc = formatAddresses(message.getRecipients(Message.RecipientType.CC)),
                replyTo = formatAddresses(message.replyTo, plain = true),
                references = message.getHeader("References")?.firstOrNull().orEmpty(),
                attachments = collector.attachments,
            )
        }
    }

    suspend fun setFlag(folderName: String, uid: Long, flag: Flags.Flag, value: Boolean) = withStore { store ->
        store.withFolder(folderName, Folder.READ_WRITE) { folder ->
            folder.getMessageByUID(uid)?.setFlag(flag, value)
        }
        Unit
    }

    suspend fun move(folderName: String, uid: Long, target: String) = withStore { store ->
        store.withFolder(folderName, Folder.READ_WRITE) { folder ->
            val message = folder.getMessageByUID(uid) ?: return@withFolder
            val destination = store.getFolder(target)
            if (store.hasCapability("MOVE")) {
                folder.moveMessages(arrayOf(message), destination)
            } else {
                folder.copyMessages(arrayOf(message), destination)
                message.setFlag(Flags.Flag.DELETED, true)
                if (store.hasCapability("UIDPLUS")) folder.expunge(arrayOf(message)) else folder.expunge()
            }
        }
        Unit
    }

    suspend fun deletePermanently(folderName: String, uid: Long) = withStore { store ->
        store.withFolder(folderName, Folder.READ_WRITE) { folder ->
            val message = folder.getMessageByUID(uid) ?: return@withFolder
            message.setFlag(Flags.Flag.DELETED, true)
            if (store.hasCapability("UIDPLUS")) folder.expunge(arrayOf(message)) else folder.expunge()
        }
        Unit
    }

    private fun buildMessage(session: Session, draft: Draft): MimeMessage = MimeMessage(session).apply {
        setFrom(InternetAddress(account.email, account.displayName, "UTF-8"))
        if (draft.to.isNotBlank()) setRecipients(Message.RecipientType.TO, InternetAddress.parse(draft.to, false))
        if (draft.cc.isNotBlank()) setRecipients(Message.RecipientType.CC, InternetAddress.parse(draft.cc, false))
        if (draft.bcc.isNotBlank()) setRecipients(Message.RecipientType.BCC, InternetAddress.parse(draft.bcc, false))
        setSubject(draft.subject, "UTF-8")
        setText(draft.body, "UTF-8")
        sentDate = Date()
        draft.inReplyTo?.takeIf { it.isNotBlank() }?.let { setHeader("In-Reply-To", it) }
        draft.references?.takeIf { it.isNotBlank() }?.let { setHeader("References", it) }
        setHeader("X-Mailer", "LunaMail for Android")
        saveChanges()
    }

    /** Legt einen Entwurf im Entwürfe-Ordner ab. */
    suspend fun saveDraft(draft: Draft, draftsFolder: String) = withStore { store ->
        val message = buildMessage(smtpSession(), draft)
        message.setFlag(Flags.Flag.DRAFT, true)
        message.setFlag(Flags.Flag.SEEN, true)
        store.getFolder(draftsFolder).appendMessages(arrayOf(message))
    }

    /** Lädt den Inhalt des [index]-ten Anhangs (Reihenfolge wie in [MessageBody.attachments]). */
    suspend fun fetchAttachment(folderName: String, uid: Long, index: Int): ByteArray = withStore { store ->
        store.withFolder(folderName, Folder.READ_ONLY) { folder ->
            val message = folder.getMessageByUID(uid) ?: throw MessagingException("Nachricht nicht mehr vorhanden")
            val collector = BodyCollector(captureIndex = index)
            collector.walk(message)
            collector.captured ?: throw MessagingException("Anhang nicht gefunden")
        }
    }

    suspend fun send(draft: Draft, sentFolder: String?) {
        val session = smtpSession()
        val message = buildMessage(session, draft)
        withContext(Dispatchers.IO) {
            val transport = session.getTransport("smtp")
            transport.connect(account.smtpHost, account.smtpPort, account.username, password)
            try {
                transport.sendMessage(message, message.allRecipients)
            } finally {
                transport.close()
            }
        }
        if (sentFolder != null && !account.serverStoresSentMail) {
            runCatching {
                withStore { store ->
                    message.setFlag(Flags.Flag.SEEN, true)
                    store.getFolder(sentFolder).appendMessages(arrayOf(message))
                }
            }
        }
    }

    fun close() {
        runCatching { store?.close() }
        store = null
    }

    private class BodyCollector(private val captureIndex: Int = -1) {
        var html: String? = null
        var text: String? = null
        val attachments = mutableListOf<AttachmentInfo>()
        val inline = mutableMapOf<String, String>()
        var captured: ByteArray? = null

        private fun contentId(part: Part) =
            runCatching { part.getHeader("Content-ID")?.firstOrNull() }.getOrNull()?.trim('<', '>', ' ')?.takeIf { it.isNotEmpty() }

        /** Wie [addAttachment], nur ohne Inhalt zu lesen (für die Anhangsliste). */
        private fun attachmentsOnly(part: Part, name: String) {
            attachments += AttachmentInfo(name, part.contentType.substringBefore(';').lowercase(), part.size, attachments.size)
        }

        private fun addAttachment(part: Part, name: String) {
            val index = attachments.size
            attachments += AttachmentInfo(name, part.contentType.substringBefore(';').lowercase(), part.size, index)
            if (index == captureIndex) captured = part.inputStream.use { it.readBytes() }
        }

        fun walk(part: Part) {
            val disposition = runCatching { part.disposition }.getOrNull()
            val fileName = runCatching { part.fileName?.let { MimeUtility.decodeText(it) } }.getOrNull()
            when {
                part.isMimeType("multipart/*") -> {
                    val multipart = part.content as? Multipart ?: return
                    for (i in 0 until multipart.count) walk(multipart.getBodyPart(i))
                }
                part.isMimeType("message/rfc822") && disposition == null -> (part.content as? Part)?.let(::walk)
                // Bilder mit Content-ID (Logos, Signaturen) werden im HTML über „cid:“ eingebunden,
                // auch wenn der Absender sie als Anhang markiert. part.size ist bei base64 oft -1.
                part.isMimeType("image/*") && contentId(part) != null && captureIndex < 0 -> {
                    val bytes = part.inputStream.use { it.readBytes() }.takeIf { it.size <= MAX_INLINE_IMAGE }
                    if (bytes != null) {
                        val type = part.contentType.substringBefore(';').trim().lowercase()
                        inline[contentId(part)!!] = "data:$type;base64," + Base64.getEncoder().encodeToString(bytes)
                    }
                    if (disposition.equals(Part.ATTACHMENT, true)) attachmentsOnly(part, fileName ?: "Bild")
                }
                part.isMimeType("image/*") && contentId(part) != null -> {
                    if (disposition.equals(Part.ATTACHMENT, true)) addAttachment(part, fileName ?: "Bild")
                }
                disposition.equals(Part.ATTACHMENT, true) || (fileName != null && !part.isMimeType("image/*")) -> {
                    addAttachment(part, fileName ?: "Anhang")
                }
                part.isMimeType("image/*") -> addAttachment(part, fileName ?: "Bild")
                part.isMimeType("text/html") && html == null -> html = textContent(part)
                part.isMimeType("text/plain") && text == null -> text = textContent(part)
            }
        }
    }

    companion object {
        const val PAGE_SIZE = 60

        /** Erhöhen, wenn sich die Aufbereitung ändert, damit zwischengespeicherte Inhalte neu geladen werden. */
        const val BODY_FORMAT = 2
        private const val MAX_INLINE_IMAGE = 5_000_000

        fun inferRole(fullName: String, attributes: List<String>): MailboxRole {
            val attrs = attributes.map { it.lowercase() }
            val name = fullName.lowercase().substringAfterLast('/').substringAfterLast('.')
            return when {
                fullName.equals("INBOX", true) -> MailboxRole.INBOX
                "\\drafts" in attrs -> MailboxRole.DRAFTS
                "\\sent" in attrs -> MailboxRole.SENT
                "\\trash" in attrs -> MailboxRole.TRASH
                "\\junk" in attrs -> MailboxRole.JUNK
                "\\archive" in attrs -> MailboxRole.ARCHIVE
                "\\all" in attrs -> MailboxRole.ALL
                name in setOf("drafts", "entwürfe", "entwurf", "draft") -> MailboxRole.DRAFTS
                name in setOf("sent", "sent items", "sent messages", "gesendet", "gesendete objekte", "gesendete elemente") -> MailboxRole.SENT
                name in setOf("trash", "deleted", "deleted items", "deleted messages", "papierkorb", "gelöscht", "gelöschte elemente", "gelöschte objekte") -> MailboxRole.TRASH
                name in setOf("junk", "spam", "junk e-mail", "spamverdacht", "werbung") -> MailboxRole.JUNK
                name in setOf("archive", "archiv", "archives") -> MailboxRole.ARCHIVE
                else -> MailboxRole.OTHER
            }
        }

        fun displayName(fullName: String, name: String, role: MailboxRole): String = when (role) {
            MailboxRole.INBOX -> "Eingang"
            MailboxRole.DRAFTS -> "Entwürfe"
            MailboxRole.SENT -> "Gesendet"
            MailboxRole.TRASH -> "Papierkorb"
            MailboxRole.JUNK -> "Werbung"
            MailboxRole.ARCHIVE -> "Archiv"
            MailboxRole.ALL -> "Alle E-Mails"
            MailboxRole.OTHER -> name.ifBlank { fullName }
        }

        fun formatAddresses(addresses: Array<Address>?, plain: Boolean = false): String =
            addresses.orEmpty().joinToString(", ") { address ->
                val internet = address as? InternetAddress
                when {
                    internet == null -> address.toString()
                    plain -> internet.address
                    else -> internet.personal?.takeIf { it.isNotBlank() } ?: internet.address
                }
            }

        fun htmlToText(html: String): String = html
            .replace(Regex("(?is)<(style|script|head)[^>]*>.*?</\\1>"), " ")
            .replace(Regex("(?i)<br\\s*/?>|</p>|</div>|</tr>"), "\n")
            .replace(Regex("<[^>]+>"), " ")
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&zwnj;", "")
            .replace(Regex("&#?\\w+;"), " ")

        /**
         * Liest einen Textteil als String. Fehlt ein passender Content-Handler oder ist der
         * Zeichensatz unbekannt, liefert JavaMail einen Stream statt eines Strings.
         */
        fun textContent(part: Part): String? {
            val content = runCatching { part.content }.getOrNull()
            if (content is String) return content
            val charset = runCatching {
                javax.mail.internet.ContentType(part.contentType).getParameter("charset")
                    ?.let { java.nio.charset.Charset.forName(MimeUtility.javaCharset(it)) }
            }.getOrNull() ?: Charsets.UTF_8
            val stream = content as? java.io.InputStream ?: runCatching { part.inputStream }.getOrNull() ?: return null
            return stream.use { String(it.readBytes(), charset) }
        }

        private fun findText(part: Part, mime: String): String? {
            if (runCatching { part.disposition }.getOrNull().equals(Part.ATTACHMENT, true)) return null
            if (part.isMimeType(mime)) return textContent(part)
            if (part.isMimeType("multipart/*")) {
                val multipart = part.content as? Multipart ?: return null
                for (i in 0 until multipart.count) {
                    findText(multipart.getBodyPart(i), mime)?.let { return it }
                }
            }
            return null
        }

        private fun hasAttachments(part: Part): Boolean {
            if (part.isMimeType("multipart/*")) {
                val multipart = part.content as? Multipart ?: return false
                return (0 until multipart.count).any { hasAttachments(multipart.getBodyPart(it)) }
            }
            return part.disposition.equals(Part.ATTACHMENT, true)
        }
    }
}
