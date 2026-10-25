package com.kidsguard.child.data.repository

import com.kidsguard.child.data.local.SecureCredentialStorage
import com.kidsguard.child.data.local.ServerConfigStorage
import com.kidsguard.child.data.local.SessionStorage
import com.kidsguard.child.data.model.ApiResult
import com.kidsguard.child.data.model.DevicePolicyResponse
import com.kidsguard.child.data.model.DeviceSession
import com.kidsguard.child.data.model.PairingRequest
import com.kidsguard.child.data.remote.KidsGuardApiClient
import com.kidsguard.child.service.usage.UsageStatsReader
import com.kidsguard.child.service.work.HeartbeatScheduler
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Repository orchestrating device identity, credential security, policy sync, and screen-time reporting.
 * Child users cannot unpair the device or modify parental policies.
 */
class DeviceRepository(
    private val apiClient: KidsGuardApiClient,
    private val secureStorage: SecureCredentialStorage,
    private val sessionStorage: SessionStorage,
    private val serverConfigStorage: ServerConfigStorage,
    private val heartbeatScheduler: HeartbeatScheduler? = null
) {
    private val _deviceSession = MutableStateFlow(sessionStorage.getSession())
    val deviceSession: StateFlow<DeviceSession> = _deviceSession.asStateFlow()

    private fun currentIsoTimestamp(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date())
    }

    /**
     * Redeems a pairing code, saves resulting credentials securely, and initializes periodic work.
     */
    suspend fun redeemPairingCode(code: String, name: String): ApiResult<DeviceSession> {
        val baseUrl = serverConfigStorage.getApiBaseUrl()
        val request = PairingRequest(code = code.trim(), name = name.trim(), platform = "android")

        val result = apiClient.redeemPairingCode(baseUrl, request)
        return when (result) {
            is ApiResult.Success -> {
                val response = result.data
                val now = currentIsoTimestamp()

                // Save secret credential only after confirmed backend success
                secureStorage.saveDeviceCredential(response.deviceCredential)

                val newSession = DeviceSession(
                    isPaired = true,
                    pairingStatus = DeviceSession.STATUS_PAIRED,
                    deviceId = response.device.id,
                    deviceName = response.device.name,
                    childProfileId = response.device.childProfileId,
                    platform = response.device.platform,
                    pairedAt = response.device.pairedAt ?: now,
                    lastSeenAt = response.device.lastSeenAt,
                    lastHeartbeatAt = null,
                    lastHeartbeatStatus = null,
                    acknowledgedPolicyVersion = 0,
                    lastPolicySyncAt = null,
                    lastScreenTimeReportAt = null
                )

                sessionStorage.saveSession(newSession)
                _deviceSession.value = newSession

                // Schedule background synchronization periodic work
                heartbeatScheduler?.schedulePeriodicHeartbeat()

                ApiResult.Success(newSession)
            }
            is ApiResult.Error -> {
                ApiResult.Error(
                    message = result.message,
                    statusCode = result.statusCode,
                    isNetworkError = result.isNetworkError,
                    isAuthError = result.isAuthError
                )
            }
        }
    }

    /**
     * Sends presence heartbeat to server.
     */
    suspend fun sendHeartbeat(): ApiResult<DeviceSession> {
        val currentSession = _deviceSession.value
        if (!currentSession.isPaired || !secureStorage.hasDeviceCredential()) {
            return ApiResult.Error("Device is not paired.")
        }

        if (currentSession.pairingStatus == DeviceSession.STATUS_INVALID_SESSION) {
            return ApiResult.Error("Device session is invalid or expired. Re-pairing is required.", isAuthError = true)
        }

        val credential = secureStorage.getDeviceCredential() ?: return ApiResult.Error("Missing device credential.")
        val baseUrl = serverConfigStorage.getApiBaseUrl()

        val result = apiClient.sendHeartbeat(baseUrl, credential)
        return when (result) {
            is ApiResult.Success -> {
                val response = result.data
                val now = currentIsoTimestamp()

                val updatedSession = currentSession.copy(
                    lastSeenAt = response.device.lastSeenAt ?: now,
                    lastHeartbeatAt = now,
                    lastHeartbeatStatus = "ok"
                )

                sessionStorage.saveSession(updatedSession)
                _deviceSession.value = updatedSession
                ApiResult.Success(updatedSession)
            }
            is ApiResult.Error -> {
                handleSyncError(result, currentSession)
            }
        }
    }

    /**
     * Synchronizes parental policies from the server and updates local device session.
     * Designed for automated, continuous synchronization without invoking rate-limited heartbeat or screen-time endpoints.
     */
    suspend fun syncPolicyOnly(policyRepository: PolicyRepository): ApiResult<DevicePolicyResponse> {
        val currentSession = _deviceSession.value
        if (!currentSession.isPaired || !secureStorage.hasDeviceCredential()) {
            return ApiResult.Error("Device is not paired.")
        }

        if (currentSession.pairingStatus == DeviceSession.STATUS_INVALID_SESSION) {
            return ApiResult.Error("Device session is invalid or expired. Re-pairing is required.", isAuthError = true)
        }

        val credential = secureStorage.getDeviceCredential() ?: return ApiResult.Error("Missing device credential.")
        val baseUrl = serverConfigStorage.getApiBaseUrl()
        val now = currentIsoTimestamp()

        val policyResult = policyRepository.syncPolicy(baseUrl, credential)
        if (policyResult is ApiResult.Error && policyResult.isAuthError) {
            handleSyncError(policyResult, currentSession)
            return policyResult
        }

        if (policyResult is ApiResult.Success) {
            val policy = policyResult.data
            val ackSuccess = policyRepository.lastAckSucceeded

            val updatedSession = currentSession.copy(
                lastSeenAt = now,
                lastHeartbeatAt = now,
                lastHeartbeatStatus = "ok",
                acknowledgedPolicyVersion = if (ackSuccess) policy.policyVersion else currentSession.acknowledgedPolicyVersion,
                lastPolicySyncAt = now,
                dailyLimitMinutes = policy.dailyLimitMinutes,
                quietHoursEnabled = policy.quietHoursEnabled,
                quietHoursRange = if (policy.quietHoursEnabled) {
                    "${policy.quietHoursStart} - ${policy.quietHoursEnd}"
                } else null
            )

            sessionStorage.saveSession(updatedSession)
            _deviceSession.value = updatedSession
        }
        return policyResult
    }

    /**
     * Full synchronization: Heartbeat + Policy Sync + Screen-Time Usage Report.
     */
    suspend fun syncAll(
        policyRepository: PolicyRepository,
        usageStatsReader: UsageStatsReader
    ): ApiResult<DeviceSession> {
        val currentSession = _deviceSession.value
        if (!currentSession.isPaired || !secureStorage.hasDeviceCredential()) {
            return ApiResult.Error("Device is not paired.")
        }

        if (currentSession.pairingStatus == DeviceSession.STATUS_INVALID_SESSION) {
            return ApiResult.Error("Device session is invalid or expired. Re-pairing is required.", isAuthError = true)
        }

        val credential = secureStorage.getDeviceCredential() ?: return ApiResult.Error("Missing device credential.")
        val baseUrl = serverConfigStorage.getApiBaseUrl()
        val now = currentIsoTimestamp()

        // 1. Send Heartbeat
        val hbResult = apiClient.sendHeartbeat(baseUrl, credential)
        if (hbResult is ApiResult.Error) {
            // Heartbeat rate limiting (429) should never abort policy sync or screen-time telemetry
            if (hbResult.statusCode != 429 && !hbResult.isRateLimitError) {
                return handleSyncError(hbResult, currentSession)
            }
        }

        // 2. Fetch & Acknowledge Policy
        val policyResult = policyRepository.syncPolicy(baseUrl, credential)
        if (policyResult is ApiResult.Error && policyResult.isAuthError) {
            return handleSyncError(policyResult, currentSession)
        }
        val policySuccess = policyResult is ApiResult.Success
        val ackSuccess = policySuccess && policyRepository.lastAckSucceeded
        val policy = if (policySuccess) (policyResult as ApiResult.Success).data else null

        // 3. Measure and Report Screen-Time
        val usageReport = usageStatsReader.measureTodayUsage()
        val reportResult = apiClient.reportScreenTime(baseUrl, credential, usageReport)
        if (reportResult is ApiResult.Error && reportResult.isAuthError) {
            return handleSyncError(reportResult, currentSession)
        }
        val reportSuccess = reportResult is ApiResult.Success

        val updatedSession = currentSession.copy(
            lastSeenAt = now,
            lastHeartbeatAt = now,
            lastHeartbeatStatus = "ok",
            acknowledgedPolicyVersion = if (ackSuccess && policy != null) policy.policyVersion else currentSession.acknowledgedPolicyVersion,
            lastPolicySyncAt = if (policySuccess) now else currentSession.lastPolicySyncAt,
            lastScreenTimeReportAt = if (reportSuccess) now else currentSession.lastScreenTimeReportAt,
            dailyLimitMinutes = if (policySuccess && policy != null) policy.dailyLimitMinutes else currentSession.dailyLimitMinutes,
            quietHoursEnabled = if (policySuccess && policy != null) policy.quietHoursEnabled else currentSession.quietHoursEnabled,
            quietHoursRange = if (policySuccess && policy != null) {
                if (policy.quietHoursEnabled) "${policy.quietHoursStart} - ${policy.quietHoursEnd}" else null
            } else {
                currentSession.quietHoursRange
            }
        )

        sessionStorage.saveSession(updatedSession)
        _deviceSession.value = updatedSession

        return if (!policySuccess) {
            policyResult as ApiResult.Error
        } else if (!reportSuccess) {
            reportResult as ApiResult.Error
        } else {
            ApiResult.Success(updatedSession)
        }
    }

    private fun handleSyncError(
        result: ApiResult.Error,
        currentSession: DeviceSession
    ): ApiResult.Error {
        return if (result.statusCode == 401 || result.isAuthError) {
            // Revoked by parent or token invalid: transition to invalid_session
            val invalidSession = currentSession.copy(
                pairingStatus = DeviceSession.STATUS_INVALID_SESSION,
                lastHeartbeatStatus = DeviceSession.STATUS_INVALID_SESSION
            )
            sessionStorage.saveSession(invalidSession)
            _deviceSession.value = invalidSession
            heartbeatScheduler?.cancelPeriodicHeartbeat()

            ApiResult.Error("Device session is invalid or expired. Re-pairing is required.", statusCode = 401, isAuthError = true)
        } else if (result.isNetworkError || result.isTemporaryFailure) {
            val offlineSession = currentSession.copy(
                lastHeartbeatStatus = "offline"
            )
            sessionStorage.saveSession(offlineSession)
            _deviceSession.value = offlineSession
            ApiResult.Error(
                message = result.message,
                statusCode = result.statusCode,
                isNetworkError = result.isNetworkError,
                isTimeout = result.isTimeout,
                isServerError = result.isServerError,
                isRateLimitError = result.isRateLimitError
            )
        } else {
            val errorSession = currentSession.copy(
                lastHeartbeatStatus = "error"
            )
            sessionStorage.saveSession(errorSession)
            _deviceSession.value = errorSession
            ApiResult.Error(
                message = result.message,
                statusCode = result.statusCode,
                isNetworkError = false,
                isServerError = result.isServerError,
                isRateLimitError = result.isRateLimitError
            )
        }
    }
}
