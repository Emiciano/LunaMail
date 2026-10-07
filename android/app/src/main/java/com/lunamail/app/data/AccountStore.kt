package com.lunamail.app.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Speichert Konten als JSON im privaten App-Speicher. Passwörter werden mit einem
 * Schlüssel aus dem Android Keystore (AES-GCM) verschlüsselt und verlassen das Gerät nicht.
 */
class AccountStore(context: Context) {
    @Serializable
    private data class StoredAccount(val account: Account, val secret: String)

    @Serializable
    private data class StoredState(val accounts: List<StoredAccount> = emptyList())

    private val file = File(context.filesDir, "accounts.json")
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    @Synchronized
    private fun load(): StoredState =
        if (!file.exists()) StoredState() else runCatching { json.decodeFromString(StoredState.serializer(), file.readText()) }
            .getOrDefault(StoredState())

    @Synchronized
    private fun save(state: StoredState) {
        val tmp = File(file.parentFile, "accounts.json.tmp")
        tmp.writeText(json.encodeToString(StoredState.serializer(), state))
        tmp.renameTo(file)
    }

    fun accounts(): List<Account> = load().accounts.map { it.account }

    fun password(accountId: String): String =
        load().accounts.firstOrNull { it.account.id == accountId }?.secret?.let(::decrypt).orEmpty()

    @Synchronized
    fun upsert(account: Account, password: String) {
        val state = load()
        val entry = StoredAccount(account, encrypt(password))
        val existing = state.accounts.indexOfFirst { it.account.id == account.id }
        val next = if (existing >= 0) state.accounts.toMutableList().also { it[existing] = entry } else state.accounts + entry
        save(StoredState(next))
    }

    @Synchronized
    fun remove(accountId: String) {
        save(StoredState(load().accounts.filterNot { it.account.id == accountId }))
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val payload = cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(payload, Base64.NO_WRAP)
    }

    private fun decrypt(encoded: String): String? = runCatching {
        val payload = Base64.decode(encoded, Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, payload, 0, IV_LENGTH))
        String(cipher.doFinal(payload, IV_LENGTH, payload.size - IV_LENGTH), Charsets.UTF_8)
    }.getOrNull()

    private companion object {
        const val KEY_ALIAS = "lunamail_credentials"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_LENGTH = 12
    }
}
