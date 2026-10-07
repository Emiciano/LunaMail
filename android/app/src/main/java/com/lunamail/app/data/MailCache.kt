package com.lunamail.app.data

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.io.File
import java.security.MessageDigest

/** Lokaler Zwischenspeicher, damit Postfächer sofort und auch offline erscheinen. */
class MailCache(private val root: File) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    private fun hash(value: String): String =
        MessageDigest.getInstance("SHA-1").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }

    private fun accountDir(accountId: String) = File(root, "accounts/${hash(accountId)}").apply { mkdirs() }

    private fun messagesFile(box: BoxRef) = File(accountDir(box.accountId), "messages-${hash(box.folder)}.json")
    private fun bodyFile(message: MessageSummary) =
        File(accountDir(message.accountId), "bodies/${hash(message.folder)}-${message.uid}.json")

    fun mailboxes(accountId: String): List<Mailbox> =
        read(File(accountDir(accountId), "mailboxes.json")) { json.decodeFromString(ListSerializer(Mailbox.serializer()), it) }
            ?: emptyList()

    fun saveMailboxes(accountId: String, mailboxes: List<Mailbox>) =
        write(File(accountDir(accountId), "mailboxes.json"), json.encodeToString(ListSerializer(Mailbox.serializer()), mailboxes))

    fun messages(box: BoxRef): List<MessageSummary> =
        read(messagesFile(box)) { json.decodeFromString(ListSerializer(MessageSummary.serializer()), it) } ?: emptyList()

    fun saveMessages(box: BoxRef, messages: List<MessageSummary>) =
        write(messagesFile(box), json.encodeToString(ListSerializer(MessageSummary.serializer()), messages))

    fun body(message: MessageSummary): MessageBody? =
        read(bodyFile(message)) { json.decodeFromString(MessageBody.serializer(), it) }

    fun saveBody(message: MessageSummary, body: MessageBody) =
        write(bodyFile(message), json.encodeToString(MessageBody.serializer(), body))

    fun clearAccount(accountId: String) {
        accountDir(accountId).deleteRecursively()
    }

    private fun <T> read(file: File, decode: (String) -> T): T? =
        if (!file.exists()) null else runCatching { decode(file.readText()) }.getOrNull()

    private fun write(file: File, content: String) {
        runCatching {
            file.parentFile?.mkdirs()
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeText(content)
            tmp.renameTo(file)
        }
    }
}
