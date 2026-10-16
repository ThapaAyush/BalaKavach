package com.kidsguard.child

import android.content.Context
import android.content.SharedPreferences
import com.kidsguard.child.data.local.ServerConfigStorage
import com.kidsguard.child.data.remote.KidsGuardApiClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.mockito.kotlin.any

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

        // Rejects unconfigured placeholder
        assertThrows(IllegalArgumentException::class.java) {
            ServerConfigStorage.normalizeApiBaseUrl(ServerConfigStorage.UNCONFIGURED_PLACEHOLDER)
        }

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

    @Test
    fun `validateReleaseApiBaseUrl strictly requires remote HTTPS URL and rejects localhost or unconfigured`() {
        // Accepts valid remote HTTPS
        assertEquals("https://api.kidsguard.example.com/api/v1", ServerConfigStorage.validateReleaseApiBaseUrl("https://api.kidsguard.example.com/api/v1/"))
        assertEquals("https://kidsguard-api.onrender.com/api/v1", ServerConfigStorage.validateReleaseApiBaseUrl("https://kidsguard-api.onrender.com/api/v1"))

        // Rejects unconfigured placeholder
        val exPlaceholder = assertThrows(IllegalArgumentException::class.java) {
            ServerConfigStorage.validateReleaseApiBaseUrl(ServerConfigStorage.UNCONFIGURED_PLACEHOLDER)
        }
        assertTrue(exPlaceholder.message!!.contains("unconfigured"))

        // Rejects null and blank
        assertThrows(IllegalArgumentException::class.java) {
            ServerConfigStorage.validateReleaseApiBaseUrl(null)
        }
        assertThrows(IllegalArgumentException::class.java) {
            ServerConfigStorage.validateReleaseApiBaseUrl("   ")
        }

        // Rejects emulator loopback and localhost
        assertThrows(IllegalArgumentException::class.java) {
            ServerConfigStorage.validateReleaseApiBaseUrl("http://10.0.2.2:5000/api/v1")
        }
        assertThrows(IllegalArgumentException::class.java) {
            ServerConfigStorage.validateReleaseApiBaseUrl("http://localhost:5000/api/v1")
        }
        assertThrows(IllegalArgumentException::class.java) {
            ServerConfigStorage.validateReleaseApiBaseUrl("https://localhost:5000/api/v1")
        }
        assertThrows(IllegalArgumentException::class.java) {
            ServerConfigStorage.validateReleaseApiBaseUrl("https://10.0.2.2:5000/api/v1")
        }
        assertThrows(IllegalArgumentException::class.java) {
            ServerConfigStorage.validateReleaseApiBaseUrl("https://127.0.0.1:5000/api/v1")
        }

        // Rejects insecure remote HTTP
        assertThrows(IllegalArgumentException::class.java) {
            ServerConfigStorage.validateReleaseApiBaseUrl("http://api.kidsguard.example.com/api/v1")
        }
    }

    @Test
    fun `ServerConfigStorage enforces variant rules in debug and release environments`() {
        val mockContext = mock(Context::class.java)
        val mockPrefs = mock(SharedPreferences::class.java)
        val mockEditor = mock(SharedPreferences.Editor::class.java)

        `when`(mockContext.getSharedPreferences("kidsguard_config", Context.MODE_PRIVATE)).thenReturn(mockPrefs)
        `when`(mockPrefs.edit()).thenReturn(mockEditor)
        `when`(mockEditor.putString(any(), any())).thenReturn(mockEditor)
        `when`(mockEditor.remove(any())).thenReturn(mockEditor)

        // 1. Debug build with default URL
        `when`(mockPrefs.getString("api_base_url", null)).thenReturn(null)
        val debugStorage = ServerConfigStorage(
            context = mockContext,
            defaultBaseUrl = "http://10.0.2.2:5000/api/v1",
            isDebuggableProvider = { true }
        )
        assertEquals("http://10.0.2.2:5000/api/v1", debugStorage.getApiBaseUrl())

        // 2. Debug build with saved URL override
        `when`(mockPrefs.getString("api_base_url", null)).thenReturn("https://custom.dev.example.com/api/v1")
        assertEquals("https://custom.dev.example.com/api/v1", debugStorage.getApiBaseUrl())

        // 2b. Debug build with invalid saved URL safely falls back to default URL
        `when`(mockPrefs.getString("api_base_url", null)).thenReturn("http://insecure.remote.com/api/v1")
        assertEquals("http://10.0.2.2:5000/api/v1", debugStorage.getApiBaseUrl())

        // 3. Release build with valid production URL ignores debug localhost preferences
        `when`(mockPrefs.getString("api_base_url", null)).thenReturn("http://10.0.2.2:5000/api/v1")
        val releaseStorage = ServerConfigStorage(
            context = mockContext,
            defaultBaseUrl = "https://api.kidsguard.example.com/api/v1",
            isDebuggableProvider = { false }
        )
        // Must return the production URL, NOT the debug preference!
        assertEquals("https://api.kidsguard.example.com/api/v1", releaseStorage.getApiBaseUrl())

        // 4. Release build rejects modification
        assertThrows(IllegalStateException::class.java) {
            releaseStorage.setApiBaseUrl("https://another.example.com/api/v1")
        }
        assertThrows(IllegalStateException::class.java) {
            releaseStorage.resetToDefault()
        }

        // 5. Release build with unconfigured default throws error
        val unconfiguredReleaseStorage = ServerConfigStorage(
            context = mockContext,
            defaultBaseUrl = ServerConfigStorage.UNCONFIGURED_PLACEHOLDER,
            isDebuggableProvider = { false }
        )
        assertThrows(IllegalArgumentException::class.java) {
            unconfiguredReleaseStorage.getApiBaseUrl()
        }
    }

    @Test
    fun `KidsGuardApiClient defaults to 45-second timeouts and allows configuration`() {
        val client = KidsGuardApiClient()
        assertEquals(45000, client.connectTimeoutMs)
        assertEquals(45000, client.readTimeoutMs)

        val customClient = KidsGuardApiClient(connectTimeoutMs = 12000, readTimeoutMs = 18000)
        assertEquals(12000, customClient.connectTimeoutMs)
        assertEquals(18000, customClient.readTimeoutMs)
    }

    @Test
    fun `defaultErrorMessageForStatus distinguishes auth, rate limiting, and temporary gateway errors`() {
        assertEquals("Device authentication required or session expired.", KidsGuardApiClient.defaultErrorMessageForStatus(401))
        assertEquals("Access forbidden. Device not authorized.", KidsGuardApiClient.defaultErrorMessageForStatus(403))
        assertEquals("Too many requests. Please wait and try again later.", KidsGuardApiClient.defaultErrorMessageForStatus(429))
        assertTrue(KidsGuardApiClient.defaultErrorMessageForStatus(502).contains("Bad Gateway"))
        assertTrue(KidsGuardApiClient.defaultErrorMessageForStatus(503).contains("Service Unavailable"))
        assertTrue(KidsGuardApiClient.defaultErrorMessageForStatus(504).contains("Gateway Timeout"))
        assertTrue(KidsGuardApiClient.defaultErrorMessageForStatus(500).contains("Server error (500)"))
    }

    @Test
    fun `parseErrorMessage extracts json error message and gracefully falls back on html or empty body`() {
        // Valid JSON error payload
        val jsonPayload = """{"error":{"message":"Invalid pairing code"}}"""
        assertEquals("Invalid pairing code", KidsGuardApiClient.parseErrorMessage(jsonPayload, 400))

        // Reverse proxy HTML 502 error page (e.g. Render / Cloudflare cold start or crash)
        val html502 = "<html><head><title>502 Bad Gateway</title></head><body><h1>Bad Gateway</h1></body></html>"
        val parsed502 = KidsGuardApiClient.parseErrorMessage(html502, 502)
        assertTrue(parsed502.contains("Bad Gateway"))

        // HTML 503 error page
        val html503 = "<!DOCTYPE html><html><body>503 Service Temporarily Unavailable</body></html>"
        val parsed503 = KidsGuardApiClient.parseErrorMessage(html503, 503)
        assertTrue(parsed503.contains("Service Unavailable"))

        // HTML 504 error page
        val html504 = "<html><body>504 Gateway Time-out</body></html>"
        val parsed504 = KidsGuardApiClient.parseErrorMessage(html504, 504)
        assertTrue(parsed504.contains("Gateway Timeout"))

        // Empty body fallback
        assertTrue(KidsGuardApiClient.parseErrorMessage("", 503).contains("Service Unavailable"))
    }

    @Test
    fun `classifyNetworkException differentiates socket timeouts, host resolution, and refused connections`() {
        val timeoutErr = KidsGuardApiClient.classifyNetworkException(
            java.net.SocketTimeoutException("Read timed out"),
            "Default error"
        )
        assertTrue(timeoutErr.isNetworkError)
        assertTrue(timeoutErr.isTimeout)
        assertTrue(timeoutErr.isTemporaryFailure)
        assertTrue(timeoutErr.message.contains("timed out"))

        val unknownHostErr = KidsGuardApiClient.classifyNetworkException(
            java.net.UnknownHostException("api.example.com"),
            "Default error"
        )
        assertTrue(unknownHostErr.isNetworkError)
        assertFalse(unknownHostErr.isTimeout)
        assertTrue(unknownHostErr.message.contains("resolve server address"))

        val connectErr = KidsGuardApiClient.classifyNetworkException(
            java.net.ConnectException("Connection refused"),
            "Default error"
        )
        assertTrue(connectErr.isNetworkError)
        assertFalse(connectErr.isTimeout)
        assertTrue(connectErr.message.contains("Connection refused"))

        val genericErr = KidsGuardApiClient.classifyNetworkException(
            java.io.IOException("Stream closed"),
            "Fallback error message"
        )
        assertTrue(genericErr.isNetworkError)
        assertEquals("Fallback error message", genericErr.message)
    }

    @Test
    fun `ApiResult Error accurately classifies temporary server failures, auth, and rate limiting`() {
        val err502 = com.kidsguard.child.data.model.ApiResult.Error("Bad Gateway", statusCode = 502, isServerError = true)
        assertTrue(err502.isTemporaryFailure)
        assertTrue(err502.isServerError)
        assertFalse(err502.isAuthError)

        val err503 = com.kidsguard.child.data.model.ApiResult.Error("Service Unavailable", statusCode = 503, isServerError = true)
        assertTrue(err503.isTemporaryFailure)
        assertTrue(err503.isServerError)
        assertFalse(err503.isAuthError)

        val err504 = com.kidsguard.child.data.model.ApiResult.Error("Gateway Timeout", statusCode = 504, isServerError = true)
        assertTrue(err504.isTemporaryFailure)
        assertTrue(err504.isServerError)
        assertFalse(err504.isAuthError)

        val err401 = com.kidsguard.child.data.model.ApiResult.Error("Session expired", statusCode = 401, isAuthError = true)
        assertFalse(err401.isTemporaryFailure)
        assertTrue(err401.isAuthError)
        assertFalse(err401.isServerError)

        val err429 = com.kidsguard.child.data.model.ApiResult.Error("Too many requests", statusCode = 429, isRateLimitError = true)
        assertFalse(err429.isTemporaryFailure)
        assertTrue(err429.isRateLimitError)
        assertFalse(err429.isAuthError)

        val timeoutErr = com.kidsguard.child.data.model.ApiResult.Error("Timeout", isNetworkError = true, isTimeout = true)
        assertTrue(timeoutErr.isTemporaryFailure)
        assertTrue(timeoutErr.isTimeout)
        assertFalse(timeoutErr.isAuthError)
    }

    @Test
    fun `KidsGuardApiClient sendHeartbeat handles HTTP 502, 503, 504, 401, 429 and timeouts correctly`() = kotlinx.coroutines.runBlocking {
        val validCredential = "k".repeat(43)
        val baseUrl = "http://10.0.2.2:5000/api/v1"

        // Helper to test status code responses with mock HttpURLConnection
        fun testHeartbeatStatusCode(statusCode: Int, body: String): com.kidsguard.child.data.model.ApiResult<com.kidsguard.child.data.model.HeartbeatResponse> {
            val mockConn = mock(java.net.HttpURLConnection::class.java)
            val outputStream = java.io.ByteArrayOutputStream()
            `when`(mockConn.outputStream).thenReturn(outputStream)
            `when`(mockConn.responseCode).thenReturn(statusCode)
            val errorStream = java.io.ByteArrayInputStream(body.toByteArray(Charsets.UTF_8))
            `when`(mockConn.errorStream).thenReturn(errorStream)
            `when`(mockConn.inputStream).thenReturn(errorStream)

            val client = KidsGuardApiClient(connectionFactory = { mockConn })
            return kotlinx.coroutines.runBlocking { client.sendHeartbeat(baseUrl, validCredential) }
        }

        // Test 502 Bad Gateway
        val result502 = testHeartbeatStatusCode(502, "<html><body>502 Bad Gateway</body></html>")
        assertTrue(result502 is com.kidsguard.child.data.model.ApiResult.Error)
        val err502 = result502 as com.kidsguard.child.data.model.ApiResult.Error
        assertEquals(502, err502.statusCode)
        assertTrue(err502.isServerError)
        assertTrue(err502.isTemporaryFailure)
        assertFalse(err502.isAuthError)

        // Test 503 Service Unavailable
        val result503 = testHeartbeatStatusCode(503, "<html><body>503 Service Unavailable</body></html>")
        assertTrue(result503 is com.kidsguard.child.data.model.ApiResult.Error)
        val err503 = result503 as com.kidsguard.child.data.model.ApiResult.Error
        assertEquals(503, err503.statusCode)
        assertTrue(err503.isServerError)
        assertTrue(err503.isTemporaryFailure)
        assertFalse(err503.isAuthError)

        // Test 504 Gateway Timeout
        val result504 = testHeartbeatStatusCode(504, "<html><body>504 Gateway Timeout</body></html>")
        assertTrue(result504 is com.kidsguard.child.data.model.ApiResult.Error)
        val err504 = result504 as com.kidsguard.child.data.model.ApiResult.Error
        assertEquals(504, err504.statusCode)
        assertTrue(err504.isServerError)
        assertTrue(err504.isTemporaryFailure)
        assertFalse(err504.isAuthError)

        // Test 401 Unauthorized
        val result401 = testHeartbeatStatusCode(401, """{"error":{"message":"Invalid session"}}""")
        assertTrue(result401 is com.kidsguard.child.data.model.ApiResult.Error)
        val err401 = result401 as com.kidsguard.child.data.model.ApiResult.Error
        assertEquals(401, err401.statusCode)
        assertTrue(err401.isAuthError)
        assertFalse(err401.isTemporaryFailure)

        // Test 429 Too Many Requests
        val result429 = testHeartbeatStatusCode(429, """{"error":{"message":"Rate limit exceeded"}}""")
        assertTrue(result429 is com.kidsguard.child.data.model.ApiResult.Error)
        val err429 = result429 as com.kidsguard.child.data.model.ApiResult.Error
        assertEquals(429, err429.statusCode)
        assertTrue(err429.isRateLimitError)
        assertFalse(err429.isAuthError)

        // Test SocketTimeoutException
        val mockTimeoutConn = mock(java.net.HttpURLConnection::class.java)
        `when`(mockTimeoutConn.outputStream).thenReturn(java.io.ByteArrayOutputStream())
        `when`(mockTimeoutConn.responseCode).thenThrow(java.net.SocketTimeoutException("Read timed out"))
        val timeoutClient = KidsGuardApiClient(connectionFactory = { mockTimeoutConn })
        val resultTimeout = timeoutClient.sendHeartbeat(baseUrl, validCredential)
        assertTrue(resultTimeout is com.kidsguard.child.data.model.ApiResult.Error)
        val errTimeout = resultTimeout as com.kidsguard.child.data.model.ApiResult.Error
        assertTrue(errTimeout.isNetworkError)
        assertTrue(errTimeout.isTimeout)
        assertTrue(errTimeout.isTemporaryFailure)

        // Test Successful 200 Response
        val mockSuccessConn = mock(java.net.HttpURLConnection::class.java)
        `when`(mockSuccessConn.outputStream).thenReturn(java.io.ByteArrayOutputStream())
        `when`(mockSuccessConn.responseCode).thenReturn(200)
        val successJson = """
            {
                "data": {
                    "device": {
                        "id": "dev_12345",
                        "childProfileId": "child_12345",
                        "name": "Child Phone",
                        "platform": "android",
                        "pairingStatus": "paired",
                        "pairedAt": "2026-10-15T00:00:00Z",
                        "lastSeenAt": "2026-10-16T12:00:00Z"
                    }
                }
            }
        """.trimIndent()
        val successStream = java.io.ByteArrayInputStream(successJson.toByteArray(Charsets.UTF_8))
        `when`(mockSuccessConn.inputStream).thenReturn(successStream)
        val successClient = KidsGuardApiClient(connectionFactory = { mockSuccessConn })
        val resultSuccess = successClient.sendHeartbeat(baseUrl, validCredential)
        assertTrue(resultSuccess is com.kidsguard.child.data.model.ApiResult.Success)
        assertEquals("dev_12345", (resultSuccess as com.kidsguard.child.data.model.ApiResult.Success).data.device.id)
    }
}
