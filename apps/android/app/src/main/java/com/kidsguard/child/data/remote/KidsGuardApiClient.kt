package com.kidsguard.child.data.remote

import com.kidsguard.child.data.model.ApiResult
import com.kidsguard.child.data.model.DevicePolicyResponse
import com.kidsguard.child.data.model.HeartbeatResponse
import com.kidsguard.child.data.model.PairingRequest
import com.kidsguard.child.data.model.PairingResponse
import com.kidsguard.child.data.model.PolicyAckRequest
import com.kidsguard.child.data.model.PolicyAckResponse
import com.kidsguard.child.data.model.ScreenTimeReportRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * Robust, safe HTTP API client communicating with KidsGuard backend.
 * Enforces explicit timeouts, safe JSON parsing, and zero secret leakage.
 *
 * Timeouts:
 * - Connection timeout: 45 seconds (allows backend cold starts and TLS negotiation).
 * - Read timeout: 45 seconds (maximum ceiling for server processing, not an artificial delay).
 */
class KidsGuardApiClient(
    val connectTimeoutMs: Int = DEFAULT_CONNECT_TIMEOUT_MS,
    val readTimeoutMs: Int = DEFAULT_READ_TIMEOUT_MS,
    private val connectionFactory: (URL) -> HttpURLConnection = { it.openConnection() as HttpURLConnection }
) {

    companion object {
        /**
         * Default connection timeout: 45 seconds. Accommodates slow cold starts and TLS handshakes.
         */
        const val DEFAULT_CONNECT_TIMEOUT_MS = 45000

        /**
         * Default read timeout: 45 seconds. Maximum waiting ceiling for server responses.
         * This does not add delay to fast responses; it simply prevents early aborts during cold starts.
         */
        const val DEFAULT_READ_TIMEOUT_MS = 45000

        private val PAIRING_CODE_REGEX = Regex("^[A-Za-z0-9_-]{22}$")
        private val DEVICE_CREDENTIAL_REGEX = Regex("^[A-Za-z0-9_-]{43}$")
        private val CONTROL_CHARS_REGEX = Regex("[\\u0000-\\u001f\\u007f]")

        fun isValidPairingCode(code: String?): Boolean {
            return !code.isNullOrBlank() && PAIRING_CODE_REGEX.matches(code.trim())
        }

        fun isValidDeviceName(name: String?): Boolean {
            if (name == null) return false
            val trimmed = name.trim()
            return trimmed.isNotEmpty() && trimmed.length <= 60 && !CONTROL_CHARS_REGEX.containsMatchIn(trimmed)
        }

        fun isValidDeviceCredential(credential: String?): Boolean {
            return !credential.isNullOrBlank() && DEVICE_CREDENTIAL_REGEX.matches(credential.trim())
        }

        /**
         * Returns human-readable, safe error messages for standard HTTP status codes.
         * Distinguishes auth (401, 403), rate limiting (429), and temporary gateway errors (502, 503, 504).
         */
        fun defaultErrorMessageForStatus(statusCode: Int): String {
            return when (statusCode) {
                400 -> "Invalid request parameters."
                401 -> "Device authentication required or session expired."
                403 -> "Access forbidden. Device not authorized."
                404 -> "Requested resource not found on server."
                409 -> "Request conflicted with current server state."
                429 -> "Too many requests. Please wait and try again later."
                502 -> "Bad Gateway: Server is temporarily unavailable. Try again shortly."
                503 -> "Service Unavailable: Server is starting or temporarily overloaded. Try again shortly."
                504 -> "Gateway Timeout: Backend did not respond in time. Try again shortly."
                in 500..599 -> "Server error ($statusCode). Try again later."
                else -> "Request failed with status $statusCode"
            }
        }

        /**
         * Parses error message from server JSON response, falling back gracefully to status-based message
         * if the response is empty, malformed, or HTML (e.g. reverse proxy 502/503/504 pages).
         */
        fun parseErrorMessage(responseBody: String, statusCode: Int): String {
            return try {
                val json = JSONObject(responseBody)
                val errorObj = json.optJSONObject("error")
                val message = errorObj?.optString("message")
                if (!message.isNullOrBlank()) {
                    message
                } else {
                    defaultErrorMessageForStatus(statusCode)
                }
            } catch (_: Exception) {
                defaultErrorMessageForStatus(statusCode)
            }
        }

        /**
         * Classifies lower-level network and I/O exceptions into structured ApiResult.Error objects,
         * distinguishing socket timeouts, host resolution errors, and connection refusals.
         */
        fun classifyNetworkException(e: Exception, defaultFallbackMessage: String): ApiResult.Error {
            return when (e) {
                is java.net.SocketTimeoutException -> {
                    ApiResult.Error(
                        message = "Connection timed out waiting for server response. The server may be starting up; please retry.",
                        isNetworkError = true,
                        isTimeout = true
                    )
                }
                is java.net.UnknownHostException -> {
                    ApiResult.Error(
                        message = "Unable to resolve server address. Check your network connection.",
                        isNetworkError = true,
                        isTimeout = false
                    )
                }
                is java.net.ConnectException -> {
                    ApiResult.Error(
                        message = "Connection refused or server unreachable. Check your connection and retry.",
                        isNetworkError = true,
                        isTimeout = false
                    )
                }
                else -> {
                    ApiResult.Error(
                        message = defaultFallbackMessage,
                        isNetworkError = true,
                        isTimeout = false
                    )
                }
            }
        }
    }

    /**
     * Redeems a 22-character pairing code via POST /api/v1/device-pairing/redeem
     */
    suspend fun redeemPairingCode(
        baseUrl: String,
        request: PairingRequest
    ): ApiResult<PairingResponse> = withContext(Dispatchers.IO) {
        val trimmedCode = request.code.trim()
        val trimmedName = request.name.trim()

        if (!isValidPairingCode(trimmedCode)) {
            return@withContext ApiResult.Error("Pairing code must be a 22-character base64url string.")
        }
        if (!isValidDeviceName(trimmedName)) {
            return@withContext ApiResult.Error("Device name must be between 1 and 60 characters without control characters.")
        }

        val endpointUrl = "${baseUrl.trimEnd('/')}/device-pairing/redeem"
        val jsonBody = JSONObject().apply {
            put("code", trimmedCode)
            put("name", trimmedName)
            put("platform", "android")
        }.toString()

        var connection: HttpURLConnection? = null
        try {
            val url = URL(endpointUrl)
            connection = connectionFactory(url).apply {
                requestMethod = "POST"
                connectTimeout = connectTimeoutMs
                readTimeout = readTimeoutMs
                doInput = true
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
            }

            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
                writer.write(jsonBody)
                writer.flush()
            }

            val statusCode = connection.responseCode
            val responseStream = if (statusCode in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream ?: connection.inputStream
            }

            val responseBody = responseStream?.let { stream ->
                BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
            } ?: ""

            if (statusCode == 201) {
                val json = JSONObject(responseBody)
                val response = PairingResponse.fromJson(json)
                if (!isValidDeviceCredential(response.deviceCredential)) {
                    return@withContext ApiResult.Error("Server returned an invalid device credential format.")
                }
                ApiResult.Success(response)
            } else {
                val errorMessage = parseErrorMessage(responseBody, statusCode)
                ApiResult.Error(
                    message = errorMessage,
                    statusCode = statusCode,
                    isAuthError = statusCode == 401 || statusCode == 403,
                    isServerError = statusCode in 500..599,
                    isRateLimitError = statusCode == 429
                )
            }
        } catch (e: Exception) {
            classifyNetworkException(e, "Unable to contact the KidsGuard API. Check your connection and retry.")
        } finally {
            connection?.disconnect()
        }
    }

    /**
     * Sends device presence heartbeat via POST /api/v1/devices/heartbeat
     */
    suspend fun sendHeartbeat(
        baseUrl: String,
        deviceCredential: String
    ): ApiResult<HeartbeatResponse> = withContext(Dispatchers.IO) {
        if (!isValidDeviceCredential(deviceCredential)) {
            return@withContext ApiResult.Error(
                message = "Invalid device credential format.",
                isAuthError = true
            )
        }

        val endpointUrl = "${baseUrl.trimEnd('/')}/devices/heartbeat"
        var connection: HttpURLConnection? = null

        try {
            val url = URL(endpointUrl)
            connection = connectionFactory(url).apply {
                requestMethod = "POST"
                connectTimeout = connectTimeoutMs
                readTimeout = readTimeoutMs
                doInput = true
                doOutput = true
                setRequestProperty("Authorization", "Bearer $deviceCredential")
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
            }

            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
                writer.write("{}")
                writer.flush()
            }

            val statusCode = connection.responseCode
            val responseStream = if (statusCode in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream ?: connection.inputStream
            }

            val responseBody = responseStream?.let { stream ->
                BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
            } ?: ""

            if (statusCode == 200) {
                val json = JSONObject(responseBody)
                val response = HeartbeatResponse.fromJson(json)
                ApiResult.Success(response)
            } else {
                val errorMessage = parseErrorMessage(responseBody, statusCode)
                ApiResult.Error(
                    message = errorMessage,
                    statusCode = statusCode,
                    isAuthError = statusCode == 401,
                    isServerError = statusCode in 500..599,
                    isRateLimitError = statusCode == 429
                )
            }
        } catch (e: Exception) {
            classifyNetworkException(e, "Network unavailable. Heartbeat will retry later.")
        } finally {
            connection?.disconnect()
        }
    }

    /**
     * Fetches parent-configured policy for this device via GET /api/v1/devices/policy
     */
    suspend fun fetchPolicy(
        baseUrl: String,
        deviceCredential: String
    ): ApiResult<DevicePolicyResponse> = withContext(Dispatchers.IO) {
        if (!isValidDeviceCredential(deviceCredential)) {
            return@withContext ApiResult.Error(
                message = "Invalid device credential format.",
                isAuthError = true
            )
        }

        val endpointUrl = "${baseUrl.trimEnd('/')}/devices/policy"
        var connection: HttpURLConnection? = null

        try {
            val url = URL(endpointUrl)
            connection = connectionFactory(url).apply {
                requestMethod = "GET"
                connectTimeout = connectTimeoutMs
                readTimeout = readTimeoutMs
                doInput = true
                setRequestProperty("Authorization", "Bearer $deviceCredential")
                setRequestProperty("Accept", "application/json")
            }

            val statusCode = connection.responseCode
            val responseStream = if (statusCode in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream ?: connection.inputStream
            }

            val responseBody = responseStream?.let { stream ->
                BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
            } ?: ""

            if (statusCode == 200) {
                val json = JSONObject(responseBody)
                val response = DevicePolicyResponse.fromJson(json)
                ApiResult.Success(response)
            } else {
                val errorMessage = parseErrorMessage(responseBody, statusCode)
                ApiResult.Error(
                    message = errorMessage,
                    statusCode = statusCode,
                    isAuthError = statusCode == 401,
                    isServerError = statusCode in 500..599,
                    isRateLimitError = statusCode == 429
                )
            }
        } catch (e: Exception) {
            classifyNetworkException(e, "Network unavailable. Policy sync will retry later.")
        } finally {
            connection?.disconnect()
        }
    }

    /**
     * Acknowledges applied policy version via POST /api/v1/devices/policy/ack
     */
    suspend fun acknowledgePolicy(
        baseUrl: String,
        deviceCredential: String,
        version: Int
    ): ApiResult<PolicyAckResponse> = withContext(Dispatchers.IO) {
        if (!isValidDeviceCredential(deviceCredential)) {
            return@withContext ApiResult.Error(
                message = "Invalid device credential format.",
                isAuthError = true
            )
        }

        val endpointUrl = "${baseUrl.trimEnd('/')}/devices/policy/ack"
        val requestBody = PolicyAckRequest(acknowledgedVersion = version).toJson()
        var connection: HttpURLConnection? = null

        try {
            val url = URL(endpointUrl)
            connection = connectionFactory(url).apply {
                requestMethod = "POST"
                connectTimeout = connectTimeoutMs
                readTimeout = readTimeoutMs
                doInput = true
                doOutput = true
                setRequestProperty("Authorization", "Bearer $deviceCredential")
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
            }

            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
                writer.write(requestBody)
                writer.flush()
            }

            val statusCode = connection.responseCode
            val responseStream = if (statusCode in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream ?: connection.inputStream
            }

            val responseBody = responseStream?.let { stream ->
                BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
            } ?: ""

            if (statusCode == 200) {
                val json = JSONObject(responseBody)
                val response = PolicyAckResponse.fromJson(json)
                ApiResult.Success(response)
            } else {
                val errorMessage = parseErrorMessage(responseBody, statusCode)
                ApiResult.Error(
                    message = errorMessage,
                    statusCode = statusCode,
                    isAuthError = statusCode == 401,
                    isServerError = statusCode in 500..599,
                    isRateLimitError = statusCode == 429
                )
            }
        } catch (e: Exception) {
            classifyNetworkException(e, "Network unavailable. Policy ack will retry later.")
        } finally {
            connection?.disconnect()
        }
    }

    /**
     * Uploads measured screen-time summary to POST /api/v1/devices/screen-time
     */
    suspend fun reportScreenTime(
        baseUrl: String,
        deviceCredential: String,
        report: ScreenTimeReportRequest
    ): ApiResult<Unit> = withContext(Dispatchers.IO) {
        if (!isValidDeviceCredential(deviceCredential)) {
            return@withContext ApiResult.Error(
                message = "Invalid device credential format.",
                isAuthError = true
            )
        }

        val endpointUrl = "${baseUrl.trimEnd('/')}/devices/screen-time"
        val requestBody = report.toJson()
        var connection: HttpURLConnection? = null

        try {
            val url = URL(endpointUrl)
            connection = connectionFactory(url).apply {
                requestMethod = "POST"
                connectTimeout = connectTimeoutMs
                readTimeout = readTimeoutMs
                doInput = true
                doOutput = true
                setRequestProperty("Authorization", "Bearer $deviceCredential")
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
            }

            OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { writer ->
                writer.write(requestBody)
                writer.flush()
            }

            val statusCode = connection.responseCode
            val responseStream = if (statusCode in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream ?: connection.inputStream
            }

            val responseBody = responseStream?.let { stream ->
                BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
            } ?: ""

            if (statusCode in 200..204) {
                ApiResult.Success(Unit)
            } else {
                val errorMessage = parseErrorMessage(responseBody, statusCode)
                ApiResult.Error(
                    message = errorMessage,
                    statusCode = statusCode,
                    isAuthError = statusCode == 401,
                    isServerError = statusCode in 500..599,
                    isRateLimitError = statusCode == 429
                )
            }
        } catch (e: Exception) {
            classifyNetworkException(e, "Network unavailable. Screen-time report will retry later.")
        } finally {
            connection?.disconnect()
        }
    }
}
