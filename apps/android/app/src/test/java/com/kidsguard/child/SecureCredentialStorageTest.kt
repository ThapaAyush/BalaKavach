package com.kidsguard.child

import com.kidsguard.child.data.local.MemoryCredentialStorage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SecureCredentialStorageTest {

    @Test
    fun `starts empty and reports no credential`() {
        val storage = MemoryCredentialStorage()
        assertFalse(storage.hasDeviceCredential())
        assertNull(storage.getDeviceCredential())
    }

    @Test
    fun `stores and retrieves valid credential`() {
        val storage = MemoryCredentialStorage()
        val credential = "c".repeat(43)
        storage.saveDeviceCredential(credential)

        assertTrue(storage.hasDeviceCredential())
        assertEquals(credential, storage.getDeviceCredential())
    }

    @Test
    fun `clears credential completely on unpair or reset`() {
        val storage = MemoryCredentialStorage()
        val credential = "d".repeat(43)
        storage.saveDeviceCredential(credential)
        assertTrue(storage.hasDeviceCredential())

        storage.clearCredentials()
        assertFalse(storage.hasDeviceCredential())
        assertNull(storage.getDeviceCredential())
    }
}
