package com.kidsguard.child.data.local

import android.content.Context
import com.kidsguard.child.data.model.DevicePolicyResponse
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

/**
 * Interface for storing the cached parent policy locally.
 * Read-only from the child's perspective; updated only via server synchronization.
 */
interface LocalPolicyStorage {
    fun getCachedPolicy(): DevicePolicyResponse?
    fun savePolicy(policy: DevicePolicyResponse)
    fun clearPolicy()
}

/**
 * Thread-safe file-backed parent policy storage with atomic writes.
 */
class FilePolicyStorage(private val context: Context) : LocalPolicyStorage {

    companion object {
        private const val FILE_NAME = "kidsguard_parent_policy.json"
        private val lock = Any()
    }

    private val policyFile: File by lazy {
        File(context.filesDir, FILE_NAME)
    }

    override fun getCachedPolicy(): DevicePolicyResponse? = synchronized(lock) {
        if (!policyFile.exists()) return null
        return try {
            val content = policyFile.readText()
            val json = JSONObject(content)
            DevicePolicyResponse.fromJson(json)
        } catch (_: Exception) {
            null
        }
    }

    override fun savePolicy(policy: DevicePolicyResponse) = synchronized(lock) {
        val jsonString = policy.toJson()
        val tempFile = File(context.filesDir, "$FILE_NAME.tmp")
        try {
            FileOutputStream(tempFile).use { fos ->
                fos.write(jsonString.toByteArray(Charsets.UTF_8))
                fos.flush()
            }
            if (!tempFile.renameTo(policyFile)) {
                policyFile.writeText(jsonString, Charsets.UTF_8)
            }
        } finally {
            if (tempFile.exists()) {
                tempFile.delete()
            }
        }
    }

    override fun clearPolicy() = synchronized(lock) {
        if (policyFile.exists()) {
            policyFile.delete()
        }
    }
}

/**
 * In-memory policy storage implementation for automated unit tests.
 */
class MemoryPolicyStorage : LocalPolicyStorage {
    private var policy: DevicePolicyResponse? = null

    override fun getCachedPolicy(): DevicePolicyResponse? = policy

    override fun savePolicy(policy: DevicePolicyResponse) {
        this.policy = policy
    }

    override fun clearPolicy() {
        policy = null
    }
}
