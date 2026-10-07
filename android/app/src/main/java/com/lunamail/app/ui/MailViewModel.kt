package com.lunamail.app.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lunamail.app.data.Account
import com.lunamail.app.data.AccountStore
import com.lunamail.app.data.AttachmentInfo
import com.lunamail.app.data.BoxRef
import com.lunamail.app.data.Draft
import com.lunamail.app.data.MailCache
import com.lunamail.app.data.MailClient
import com.lunamail.app.data.Mailbox
import com.lunamail.app.data.MailboxRole
import com.lunamail.app.data.MessageBody
import com.lunamail.app.data.MessageSummary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import javax.mail.AuthenticationFailedException
import javax.mail.Flags
import javax.mail.MessagingException

sealed interface UiEvent {
    data class Info(val text: String) : UiEvent
    data class Undoable(val text: String, val actionId: Long) : UiEvent
}

class MailViewModel(app: Application) : AndroidViewModel(app) {
    private val accountStore = AccountStore(app)
    private val cache = MailCache(File(app.filesDir, "mail"))
    private val clients = ConcurrentHashMap<String, MailClient>()

    private val _accounts = MutableStateFlow(accountStore.accounts())
    val accounts: StateFlow<List<Account>> = _accounts.asStateFlow()

    private val _mailboxes = MutableStateFlow(_accounts.value.associate { it.id to cache.mailboxes(it.id) })
    val mailboxes: StateFlow<Map<String, List<Mailbox>>> = _mailboxes.asStateFlow()

    private val _messages = MutableStateFlow<Map<String, List<MessageSummary>>>(
        _accounts.value.associate { BoxRef(it.id, "INBOX").key to cache.messages(BoxRef(it.id, "INBOX")) }
    )
    val allMessages: StateFlow<Map<String, List<MessageSummary>>> = _messages.asStateFlow()

    private val _refreshing = MutableStateFlow<Set<String>>(emptySet())
    val refreshing: StateFlow<Set<String>> = _refreshing.asStateFlow()

    private val _lastSync = MutableStateFlow<Long?>(null)
    val lastSync: StateFlow<Long?> = _lastSync.asStateFlow()

    private val prefs = app.getSharedPreferences("settings", android.content.Context.MODE_PRIVATE)

    /** Ob „nach links wischen“ archiviert statt in den Papierkorb zu legen. */
    private val _swipeArchives = MutableStateFlow(prefs.getBoolean(KEY_SWIPE_ARCHIVES, false))
    val swipeArchives: StateFlow<Boolean> = _swipeArchives.asStateFlow()

    fun setSwipeArchives(value: Boolean) {
        _swipeArchives.value = value
        prefs.edit().putBoolean(KEY_SWIPE_ARCHIVES, value).apply()
    }

    private val _notifications = MutableStateFlow(prefs.getBoolean(KEY_NOTIFICATIONS, true))
    val notifications: StateFlow<Boolean> = _notifications.asStateFlow()

    fun setNotifications(value: Boolean) {
        _notifications.value = value
        prefs.edit().putBoolean(KEY_NOTIFICATIONS, value).apply()
        com.lunamail.app.NewMailWorker.schedule(getApplication(), value)
    }

    private val _events = MutableSharedFlow<UiEvent>(extraBufferCapacity = 8)
    val events: SharedFlow<UiEvent> = _events

    private class PendingAction(val job: Job, val restore: () -> Unit)
    private val pending = ConcurrentHashMap<Long, PendingAction>()
    private val actionIds = AtomicLong()

    init {
        refreshAll()
    }

    private fun client(accountId: String): MailClient? {
        val account = _accounts.value.firstOrNull { it.id == accountId } ?: return null
        return clients.getOrPut(accountId) { MailClient(account, accountStore.password(accountId)) }
    }

    fun account(accountId: String) = _accounts.value.firstOrNull { it.id == accountId }

    fun mailbox(accountId: String, role: MailboxRole): Mailbox? =
        _mailboxes.value[accountId].orEmpty().firstOrNull { it.role == role }

    fun mailbox(box: BoxRef): Mailbox? = _mailboxes.value[box.accountId].orEmpty().firstOrNull { it.fullName == box.folder }

    fun title(box: BoxRef): String = when {
        box == BoxRef.Flagged -> "Markiert"
        box == BoxRef.Unread -> "Ungelesen"
        box.isUnified -> "Alle Eingänge"
        _accounts.value.size > 1 && box.folder.equals("INBOX", true) -> account(box.accountId)?.description ?: "Eingang"
        else -> mailbox(box)?.displayName ?: box.folder.substringAfterLast('/')
    }

    fun messages(box: BoxRef): Flow<List<MessageSummary>> = combine(_messages, _accounts) { all, accounts ->
        messagesIn(box, all, accounts)
    }

    /** Aktueller Inhalt eines Postfachs, z. B. für „Nächste/Vorige E-Mail“ in der Leseansicht. */
    fun messagesNow(box: BoxRef) = messagesIn(box, _messages.value, _accounts.value)

    private fun messagesIn(box: BoxRef, all: Map<String, List<MessageSummary>>, accounts: List<Account>): List<MessageSummary> {
        val inboxes = { accounts.flatMap { all[BoxRef(it.id, "INBOX").key].orEmpty() } }
        return when (box) {
            BoxRef.UnifiedInbox -> inboxes().sortedByDescending { it.date }
            BoxRef.Unread -> inboxes().filter { !it.seen }.sortedByDescending { it.date }
            // „Markiert“ sammelt alle geladenen Postfächer, nicht nur die Eingänge.
            BoxRef.Flagged -> all.values.flatten().filter { it.flagged }.distinctBy { it.key }.sortedByDescending { it.date }
            else -> all[box.key].orEmpty()
        }
    }

    fun loadCached(box: BoxRef) {
        if (box.isUnified || _messages.value.containsKey(box.key)) return
        viewModelScope.launch(Dispatchers.IO) {
            val cached = cache.messages(box)
            _messages.update { if (it.containsKey(box.key)) it else it + (box.key to cached) }
        }
    }

    fun unreadCount(box: BoxRef): Int {
        if (box.isUnified) return _accounts.value.sumOf { unreadCount(BoxRef(it.id, "INBOX")) }
        val loaded = _messages.value[box.key]
        return loaded?.count { !it.seen } ?: (mailbox(box)?.unread ?: 0)
    }

    // region Synchronisierung

    fun refreshAll() {
        val accounts = _accounts.value
        if (accounts.isEmpty()) return
        viewModelScope.launch {
            val jobs = accounts.map { account ->
                launch {
                    refreshMailboxes(account.id)
                    refreshBox(BoxRef(account.id, "INBOX"))
                }
            }
            jobs.forEach { it.join() }
            _lastSync.value = System.currentTimeMillis()
        }
    }

    fun refreshIfStale() {
        val last = _lastSync.value ?: return
        if (System.currentTimeMillis() - last > 60_000 && _refreshing.value.isEmpty()) refreshAll()
    }

    fun refresh(box: BoxRef) {
        viewModelScope.launch {
            if (box.isUnified) {
                // Intelligente Postfächer speisen sich aus den Eingängen.
                _accounts.value.map { launch { refreshBox(BoxRef(it.id, "INBOX")) } }.forEach { it.join() }
                _lastSync.value = System.currentTimeMillis()
            } else {
                refreshBox(box)
            }
        }
    }

    private suspend fun refreshMailboxes(accountId: String) {
        val client = client(accountId) ?: return
        try {
            val boxes = client.listMailboxes().sortedWith(compareBy({ it.role.ordinal }, { it.displayName.lowercase() }))
            _mailboxes.update { it + (accountId to boxes) }
            withContext(Dispatchers.IO) { cache.saveMailboxes(accountId, boxes) }
        } catch (e: Exception) {
            report(accountId, e)
        }
    }

    private suspend fun refreshBox(box: BoxRef) {
        val client = client(box.accountId) ?: return
        _refreshing.update { it + box.key }
        try {
            val previous = _messages.value[box.key] ?: withContext(Dispatchers.IO) { cache.messages(box) }
            val knownPreviews = previous.associate { it.uid to it.preview?.takeIf { p -> p.isNotBlank() } }
            val fetched = client.fetchMessages(box.folder).map { it.copy(preview = knownPreviews[it.uid]) }
            // Bereits nachgeladene ältere Nachrichten behalten.
            val oldest = fetched.minOfOrNull { it.uid }
            val older = if (oldest == null || fetched.size < MailClient.PAGE_SIZE) emptyList()
                else previous.filter { it.uid < oldest }
            setMessages(box, fetched + older)

            val missing = fetched.filter { it.preview == null }.map { it.uid }
            for (chunk in missing.chunked(20)) {
                val previews = client.fetchPreviews(box.folder, chunk)
                val current = _messages.value[box.key].orEmpty()
                setMessages(box, current.map { m -> previews[m.uid]?.let { m.copy(preview = it) } ?: m })
            }
        } catch (e: Exception) {
            report(box.accountId, e)
        } finally {
            _refreshing.update { it - box.key }
        }
    }

    private val _loadingMore = MutableStateFlow<Set<String>>(emptySet())
    val loadingMore: StateFlow<Set<String>> = _loadingMore.asStateFlow()
    private val exhausted = ConcurrentHashMap.newKeySet<String>()

    fun canLoadMore(box: BoxRef) = !box.isUnified && box.key !in exhausted

    /** Lädt die nächsten älteren Nachrichten, wenn das Ende der Liste erreicht ist. */
    fun loadMore(box: BoxRef) {
        if (!canLoadMore(box) || box.key in _loadingMore.value || box.key in _refreshing.value) return
        val client = client(box.accountId) ?: return
        _loadingMore.update { it + box.key }
        viewModelScope.launch {
            try {
                val current = _messages.value[box.key].orEmpty()
                val older = client.fetchMessages(box.folder, skip = current.size)
                if (older.size < MailClient.PAGE_SIZE) exhausted += box.key
                val known = current.map { it.uid }.toSet()
                val added = older.filter { it.uid !in known }
                setMessages(box, current + added)
                for (chunk in added.map { it.uid }.chunked(20)) {
                    val previews = client.fetchPreviews(box.folder, chunk)
                    val latest = _messages.value[box.key].orEmpty()
                    setMessages(box, latest.map { m -> previews[m.uid]?.let { m.copy(preview = it) } ?: m })
                }
            } catch (e: Exception) {
                report(box.accountId, e)
            } finally {
                _loadingMore.update { it - box.key }
            }
        }
    }

    private suspend fun setMessages(box: BoxRef, list: List<MessageSummary>) {
        _messages.update { it + (box.key to list) }
        withContext(Dispatchers.IO) { cache.saveMessages(box, list) }
    }

    // endregion

    // region Aktionen

    private fun updateMessage(message: MessageSummary, transform: (MessageSummary) -> MessageSummary) {
        _messages.update { all ->
            val list = all[message.box.key] ?: return@update all
            all + (message.box.key to list.map { if (it.uid == message.uid) transform(it) else it })
        }
        persist(message.box)
    }

    private fun removeLocally(message: MessageSummary): () -> Unit {
        val key = message.box.key
        _messages.update { all -> all + (key to all[key].orEmpty().filterNot { it.uid == message.uid }) }
        persist(message.box)
        return {
            _messages.update { all ->
                val list = all[key].orEmpty()
                if (list.any { it.uid == message.uid }) all
                else all + (key to (list + message).sortedByDescending { it.date })
            }
            persist(message.box)
        }
    }

    private fun persist(box: BoxRef) {
        val list = _messages.value[box.key] ?: return
        viewModelScope.launch(Dispatchers.IO) { cache.saveMessages(box, list) }
    }

    /** Führt eine Server-Aktion nach kurzer Wartezeit aus, damit sie noch widerrufen werden kann. */
    private fun scheduleUndoable(text: String, restore: () -> Unit, action: suspend () -> Unit) {
        val id = actionIds.incrementAndGet()
        val job = viewModelScope.launch {
            delay(UNDO_WINDOW_MS)
            pending.remove(id)
            try {
                action()
            } catch (e: Exception) {
                restore()
                _events.tryEmit(UiEvent.Info(friendlyError(e)))
            }
        }
        pending[id] = PendingAction(job, restore)
        _events.tryEmit(UiEvent.Undoable(text, id))
    }

    fun undo(actionId: Long) {
        pending.remove(actionId)?.let {
            it.job.cancel()
            it.restore()
        }
    }

    fun canArchive(message: MessageSummary): Boolean {
        val target = archiveTarget(message.accountId) ?: return false
        return target.fullName != message.folder
    }

    private fun archiveTarget(accountId: String) =
        mailbox(accountId, MailboxRole.ARCHIVE) ?: mailbox(accountId, MailboxRole.ALL)

    /** Entfernt Nachrichten sofort aus der Liste und führt die Server-Aktion nach der Widerrufen-Frist aus. */
    private fun removeBatch(messages: List<MessageSummary>, text: String, action: suspend (MailClient, MessageSummary) -> Unit) {
        if (messages.isEmpty()) return
        val restores = messages.map { removeLocally(it) }
        scheduleUndoable(text, { restores.forEach { it() } }) {
            messages.forEach { message -> client(message.accountId)?.let { action(it, message) } }
        }
    }

    private fun countText(count: Int, single: String, plural: String) = if (count == 1) single else "$count $plural"

    fun archive(message: MessageSummary) = archive(listOf(message))

    fun archive(messages: List<MessageSummary>) {
        val archivable = messages.filter { canArchive(it) }
        if (archivable.isEmpty()) {
            _events.tryEmit(UiEvent.Info("Für dieses Konto gibt es kein Archiv-Postfach."))
            return
        }
        removeBatch(archivable, countText(archivable.size, "Archiviert", "E-Mails archiviert")) { client, m ->
            client.move(m.folder, m.uid, archiveTarget(m.accountId)!!.fullName)
        }
    }

    fun isInTrash(message: MessageSummary) = mailbox(message.accountId, MailboxRole.TRASH)?.fullName == message.folder

    fun delete(message: MessageSummary) = delete(listOf(message))

    fun delete(messages: List<MessageSummary>) {
        val permanent = messages.all { isInTrash(it) || mailbox(it.accountId, MailboxRole.TRASH) == null }
        val text = if (permanent) countText(messages.size, "Endgültig gelöscht", "E-Mails endgültig gelöscht")
            else countText(messages.size, "In den Papierkorb gelegt", "E-Mails in den Papierkorb gelegt")
        removeBatch(messages, text) { client, m ->
            val trash = mailbox(m.accountId, MailboxRole.TRASH)
            if (trash != null && trash.fullName != m.folder) client.move(m.folder, m.uid, trash.fullName)
            else client.deletePermanently(m.folder, m.uid)
        }
    }

    fun moveTo(message: MessageSummary, target: Mailbox) = moveTo(listOf(message), target)

    fun moveTo(messages: List<MessageSummary>, target: Mailbox) {
        val movable = messages.filter { it.accountId == target.accountId && it.folder != target.fullName }
        removeBatch(movable, "In „${target.displayName}“ bewegt") { client, m -> client.move(m.folder, m.uid, target.fullName) }
    }

    fun setSeen(messages: List<MessageSummary>, seen: Boolean) = messages.forEach { setSeen(it, seen) }

    fun setFlagged(messages: List<MessageSummary>, flagged: Boolean) = messages.forEach { setFlagged(it, flagged) }

    /** Wischen nach links: Papierkorb oder Archiv, wie in den Einstellungen gewählt. */
    fun swipePrimary(message: MessageSummary) =
        if (swipeArchives.value && canArchive(message)) archive(message) else delete(message)

    fun swipePrimaryArchives(message: MessageSummary) = swipeArchives.value && canArchive(message)

    fun setSeen(message: MessageSummary, seen: Boolean) {
        if (message.seen == seen) return
        updateFlag(message, Flags.Flag.SEEN, seen) { it.copy(seen = seen) }
    }

    fun setFlagged(message: MessageSummary, flagged: Boolean) {
        updateFlag(message, Flags.Flag.FLAGGED, flagged) { it.copy(flagged = flagged) }
    }

    private fun updateFlag(message: MessageSummary, flag: Flags.Flag, value: Boolean, transform: (MessageSummary) -> MessageSummary) {
        val client = client(message.accountId) ?: return
        updateMessage(message, transform)
        viewModelScope.launch {
            try {
                client.setFlag(message.folder, message.uid, flag, value)
            } catch (e: Exception) {
                updateMessage(message) { message }
                report(message.accountId, e)
            }
        }
    }

    fun findMessage(key: String): MessageSummary? =
        _messages.value.values.asSequence().flatten().firstOrNull { it.key == key }

    suspend fun loadBody(message: MessageSummary): Result<MessageBody> = runCatching {
        // Leere Einträge stammen aus Versionen, die Mailinhalte nicht lesen konnten.
        withContext(Dispatchers.IO) { cache.body(message) }?.takeIf { it.html != null || it.text != null } ?: run {
            val client = client(message.accountId) ?: error("Konto nicht gefunden")
            client.fetchBody(message.folder, message.uid).also { body ->
                withContext(Dispatchers.IO) { cache.saveBody(message, body) }
            }
        }
    }.recoverCatching { throw IllegalStateException(friendlyError(it)) }

    suspend fun saveDraft(draft: Draft): Result<Unit> = runCatching {
        val client = client(draft.accountId) ?: error("Konto nicht gefunden")
        val drafts = mailbox(draft.accountId, MailboxRole.DRAFTS) ?: error("Für dieses Konto gibt es keinen Entwürfe-Ordner.")
        client.saveDraft(draft, drafts.fullName)
        _events.tryEmit(UiEvent.Info("Entwurf gesichert"))
        Unit
    }.recoverCatching { throw IllegalStateException(friendlyError(it)) }

    /** Lädt einen Anhang in den Cache und liefert die Datei zum Öffnen. */
    suspend fun downloadAttachment(message: MessageSummary, attachment: AttachmentInfo): Result<File> = runCatching {
        val dir = File(getApplication<Application>().cacheDir, "attachments/${message.key.hashCode().toUInt()}").apply { mkdirs() }
        val safeName = attachment.fileName.replace(Regex("[\\/:*?\"<>|]"), "_").ifBlank { "Anhang" }
        val file = File(dir, "${attachment.index}-$safeName")
        if (!file.exists() || file.length() == 0L) {
            val client = client(message.accountId) ?: error("Konto nicht gefunden")
            val bytes = client.fetchAttachment(message.folder, message.uid, attachment.index)
            withContext(Dispatchers.IO) { file.writeBytes(bytes) }
        }
        file
    }.recoverCatching { throw IllegalStateException(friendlyError(it)) }

    suspend fun send(draft: Draft): Result<Unit> = runCatching {
        val client = client(draft.accountId) ?: error("Konto nicht gefunden")
        client.send(draft, mailbox(draft.accountId, MailboxRole.SENT)?.fullName)
    }.recoverCatching { throw IllegalStateException(friendlyError(it)) }

    // endregion

    // region Konten

    suspend fun addAccount(account: Account, password: String): Result<Unit> = runCatching {
        val client = MailClient(account, password)
        client.test()
        withContext(Dispatchers.IO) { accountStore.upsert(account, password) }
        clients.put(account.id, client)?.close()
        _accounts.value = accountStore.accounts()
        refreshAll()
    }.recoverCatching { throw IllegalStateException(friendlyError(it)) }

    fun removeAccount(accountId: String) {
        clients.remove(accountId)?.close()
        accountStore.remove(accountId)
        viewModelScope.launch(Dispatchers.IO) { cache.clearAccount(accountId) }
        _accounts.value = accountStore.accounts()
        _mailboxes.update { it - accountId }
        _messages.update { all -> all.filterKeys { !it.startsWith("$accountId|") } }
    }

    // endregion

    private fun report(accountId: String, e: Throwable) {
        val name = account(accountId)?.description
        val text = friendlyError(e)
        _events.tryEmit(UiEvent.Info(if (name != null && _accounts.value.size > 1) "$name: $text" else text))
    }

    override fun onCleared() {
        clients.values.forEach { it.close() }
    }

    companion object {
        const val UNDO_WINDOW_MS = 4_500L
        const val KEY_SWIPE_ARCHIVES = "swipe_archives"
        const val KEY_NOTIFICATIONS = "notifications"

        fun friendlyError(e: Throwable): String {
            if (e is com.lunamail.app.data.ServerCheckException) return "${e.server}: ${friendlyError(e.cause ?: e)}"
            val cause = generateSequence(e) { (it as? MessagingException)?.nextException ?: it.cause }.take(10).toList()
            return when {
                cause.any { it is AuthenticationFailedException } ->
                    "Anmeldung fehlgeschlagen. Bitte Benutzername und Passwort prüfen."
                cause.any { it is UnknownHostException } -> "Server nicht gefunden. Bitte die Internetverbindung prüfen."
                cause.any { it is ConnectException || it is SocketTimeoutException } ->
                    "Keine Verbindung zum Mailserver. Bitte Servername und Port prüfen."
                cause.any { it is javax.net.ssl.SSLException } -> "Sichere Verbindung zum Server fehlgeschlagen."
                else -> e.message?.takeIf { it.isNotBlank() } ?: "Unbekannter Fehler"
            }
        }
    }
}
