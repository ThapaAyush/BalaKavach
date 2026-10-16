package com.kidsguard.child

import com.kidsguard.child.data.local.ServerConfigStorage
import com.kidsguard.child.data.remote.KidsGuardApiClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class KidsGuardApiClientTest {

    @Test
    fun `validates pairing code format strictly to 22 characters base64url`() {
        assertTrue(KidsGuardApiClient.isValidPairingCode("aB3-_dE6hI9kLmNoPqRsTu"))
        assertFalse(KidsGuardApiClient.isValidPairingCode("short"))
        assertFalse(KidsGuardApiClient.isValidPairingCode("toolongcode1234567890123"))
        assertFalse(KidsGuardApiClient.isValidPairingCode("invalid+char/with=pad!"))
        assertFalse(KidsGuardApiClient.isValidPairingCode(""))
        assertFalse(KidsGuardApiClient.isValidPairingCode(null))
    }

    @Test
    fun `validates device name bounds and control characters`() {
        assertTrue(KidsGuardApiClient.isValidDeviceName("Ayush's Pixel"))
        assertTrue(KidsGuardApiClient.isValidDeviceName("A"))
        assertFalse(KidsGuardApiClient.isValidDeviceName(""))
        assertFalse(KidsGuardApiClient.isValidDeviceName("   "))
        assertFalse(KidsGuardApiClient.isValidDeviceName("a".repeat(61)))
        assertFalse(KidsGuardApiClient.isValidDeviceName("Device\u0000Name"))
        assertFalse(KidsGuardApiClient.isValidDeviceName("Device\nName"))
        assertFalse(KidsGuardApiClient.isValidDeviceName(null))
    }

    @Test
    fun `validates device credential format strictly to 43 characters base64url`() {
        val validCred = "a".repeat(43)
        assertTrue(KidsGuardApiClient.isValidDeviceCredential(validCred))
        assertFalse(KidsGuardApiClient.isValidDeviceCredential("short"))
        assertFalse(KidsGuardApiClient.isValidDeviceCredential("a".repeat(42)))
        assertFalse(KidsGuardApiClient.isValidDeviceCredential("a".repeat(44)))
        assertFalse(KidsGuardApiClient.isValidDeviceCredential("a".repeat(42) + "+"))
        assertFalse(KidsGuardApiClient.isValidDeviceCredential(null))
    }

    @Test
    fun `normalizes and validates server API base URL`() {
        // Allows emulator loopback and localhost with local HTTP
        assertEquals("http://10.0.2.2:5000/api/v1", ServerConfigStorage.normalizeApiBaseUrl("http://10.0.2.2:5000/api/v1/"))
        assertEquals("http://localhost:5000/api/v1", ServerConfigStorage.normalizeApiBaseUrl("http://localhost:5000/api/v1"))
        assertEquals("http://127.0.0.1:5000/api/v1", ServerConfigStorage.normalizeApiBaseUrl("http://127.0.0.1:5000/api/v1"))

        // Allows remote HTTPS
        assertEquals("https://api.example.com/api/v1", ServerConfigStorage.normalizeApiBaseUrl("https://api.example.com/api/v1/"))

        // Rejects insecure remote HTTP
        assertThrows(IllegalArgumentException::class.java) {
            ServerConfigStorage.normalizeApiBaseUrl("http://api.example.com/api/v1")
        }

        // Rejects credentials in URL
        assertThrows(IllegalArgumentException::class.java) {
            ServerConfigStorage.normalizeApiBaseUrl("http://user:pass@10.0.2.2:5000/api/v1")
        }

        // Rejects unsupported protocols
        assertThrows(IllegalArgumentException::class.java) {
            ServerConfigStorage.normalizeApiBaseUrl("ftp://10.0.2.2:5000/api/v1")
        }
    }
}
