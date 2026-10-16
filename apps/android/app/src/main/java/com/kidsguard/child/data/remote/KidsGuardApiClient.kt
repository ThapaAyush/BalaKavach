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
 */
class KidsGuardApiClient(
    private val connectTimeoutMs: Int = 15000,
    private val readTimeoutMs: Int = 15000
) {

    companion object {
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
            connection = (url.openConnection() as HttpURLConnection).apply {
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
                    isAuthError = statusCode == 401 || statusCode == 403
                )
            }
        } catch (e: Exception) {
            ApiResult.Error(
                message = "Unable to contact the KidsGuard API. Check your connection and retry.",
                isNetworkError = true
            )
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
            connection = (url.openConnection() as HttpURLConnection).apply {
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
                    isAuthError = statusCode == 401
                )
            }
        } catch (e: Exception) {
            ApiResult.Error(
                message = "Network unavailable. Heartbeat will retry later.",
                isNetworkError = true
            )
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
            connection = (url.openConnection() as HttpURLConnection).apply {
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
                    isAuthError = statusCode == 401
                )
            }
        } catch (e: Exception) {
            ApiResult.Error(
                message = "Network unavailable. Policy sync will retry later.",
                isNetworkError = true
            )
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
            connection = (url.openConnection() as HttpURLConnection).apply {
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
                    isAuthError = statusCode == 401
                )
            }
        } catch (e: Exception) {
            ApiResult.Error(
                message = "Network unavailable. Policy ack will retry later.",
                isNetworkError = true
            )
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
            connection = (url.openConnection() as HttpURLConnection).apply {
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
                    isAuthError = statusCode == 401
                )
            }
        } catch (e: Exception) {
            ApiResult.Error(
                message = "Network unavailable. Screen-time report will retry later.",
                isNetworkError = true
            )
        } finally {
            connection?.disconnect()
        }
    }

    private fun parseErrorMessage(responseBody: String, statusCode: Int): String {
        return try {
            val json = JSONObject(responseBody)
            val errorObj = json.optJSONObject("error")
            val message = errorObj?.optString("message")
            if (!message.isNullOrBlank()) {
                message
            } else {
                "Request failed with status $statusCode"
            }
        } catch (_: Exception) {
            when (statusCode) {
                401 -> "Device authentication required or session expired."
                429 -> "Too many requests. Try again later."
                else -> "Server error ($statusCode). Try again later."
            }
        }
    }
}
