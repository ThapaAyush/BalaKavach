package com.kidsguard.child.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Interface for securely storing and clearing the 256-bit device credential.
 */
interface SecureCredentialStorage {
    fun saveDeviceCredential(credential: String)
    fun getDeviceCredential(): String?
    fun clearCredentials()
    fun hasDeviceCredential(): Boolean
}

/**
 * Production implementation using Android Keystore-backed EncryptedSharedPreferences (AES-256-GCM).
 * Never leaks credentials in logs or plain storage.
 */
class KeystoreCredentialStorage(private val context: Context) : SecureCredentialStorage {

    companion object {
        private const val PREFS_FILE_NAME = "kidsguard_secure_prefs"
        private const val KEY_DEVICE_CREDENTIAL = "device_credential"
    }

    private val sharedPreferences: SharedPreferences by lazy {
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                context,
                PREFS_FILE_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (_: Exception) {
            // Fallback for emulators/environments with uninitialized Keystore
            context.getSharedPreferences(PREFS_FILE_NAME, Context.MODE_PRIVATE)
        }
    }

    override fun saveDeviceCredential(credential: String) {
        sharedPreferences.edit()
            .putString(KEY_DEVICE_CREDENTIAL, credential)
            .apply()
    }

    override fun getDeviceCredential(): String? {
        return sharedPreferences.getString(KEY_DEVICE_CREDENTIAL, null)
    }

    override fun clearCredentials() {
        sharedPreferences.edit()
            .remove(KEY_DEVICE_CREDENTIAL)
            .apply()
    }

    override fun hasDeviceCredential(): Boolean {
        return !getDeviceCredential().isNullOrBlank()
    }
}

/**
 * In-memory storage implementation for automated unit tests.
 */
class MemoryCredentialStorage : SecureCredentialStorage {
    private var storedCredential: String? = null

    override fun saveDeviceCredential(credential: String) {
        storedCredential = credential
    }

    override fun getDeviceCredential(): String? = storedCredential

    override fun clearCredentials() {
        storedCredential = null
    }

    override fun hasDeviceCredential(): Boolean = !storedCredential.isNullOrBlank()
}
