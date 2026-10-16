package com.kidsguard.child

import com.kidsguard.child.data.local.MemoryCredentialStorage
import com.kidsguard.child.data.local.MemoryPolicyStorage
import com.kidsguard.child.data.local.ServerConfigStorage
import com.kidsguard.child.data.local.SessionStorage
import com.kidsguard.child.data.model.ApiResult
import com.kidsguard.child.data.model.DeviceDto
import com.kidsguard.child.data.model.DevicePolicyResponse
import com.kidsguard.child.data.model.DeviceSession
import com.kidsguard.child.data.model.PairingResponse
import com.kidsguard.child.data.model.PolicyAckResponse
import com.kidsguard.child.data.model.ReportingPeriodDto
import com.kidsguard.child.data.model.ScreenTimeReportRequest
import com.kidsguard.child.data.remote.KidsGuardApiClient
import com.kidsguard.child.data.repository.DeviceRepository
import com.kidsguard.child.data.repository.PolicyRepository
import com.kidsguard.child.service.usage.UsageStatsReader
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.mockito.kotlin.any

class DeviceRepositoryTest {

    @Test
    fun `successful pairing saves credential and updates session state`() = runBlocking {
        val mockClient = mock(KidsGuardApiClient::class.java)
        val secureStorage = MemoryCredentialStorage()
        val mockSessionStorage = mock(SessionStorage::class.java)
        val mockConfigStorage = mock(ServerConfigStorage::class.java)

        `when`(mockSessionStorage.getSession()).thenReturn(DeviceSession.unpaired())
        `when`(mockConfigStorage.getApiBaseUrl()).thenReturn("http://10.0.2.2:5000/api/v1")

        val validCredential = "k".repeat(43)
        val pairingResponse = PairingResponse(
            device = DeviceDto(
                id = "dev_12345",
                childProfileId = "child_999",
                name = "Child Phone",
                platform = "android",
                pairingStatus = "paired",
                pairedAt = "2026-10-15T10:00:00.000Z",
                lastSeenAt = null,
                enforcementStatus = "not_implemented"
            ),
            deviceCredential = validCredential
        )

        `when`(mockClient.redeemPairingCode(any(), any())).thenReturn(ApiResult.Success(pairingResponse))

        val repository = DeviceRepository(
            apiClient = mockClient,
            secureStorage = secureStorage,
            sessionStorage = mockSessionStorage,
            serverConfigStorage = mockConfigStorage,
            heartbeatScheduler = null
        )

        val result = repository.redeemPairingCode("aB3-_dE6hI9kLmNoPqRsTu", "Child Phone")

        assertTrue(result is ApiResult.Success)
        val session = (result as ApiResult.Success).data
        assertTrue(session.isPaired)
        assertEquals("dev_12345", session.deviceId)
        assertEquals("Child Phone", session.deviceName)
        assertEquals("android", session.platform)

        // Credential must be stored securely
        assertTrue(secureStorage.hasDeviceCredential())
        assertEquals(validCredential, secureStorage.getDeviceCredential())
    }

    @Test
    fun `failed pairing does not save credential and reports error`() = runBlocking {
        val mockClient = mock(KidsGuardApiClient::class.java)
        val secureStorage = MemoryCredentialStorage()
        val mockSessionStorage = mock(SessionStorage::class.java)
        val mockConfigStorage = mock(ServerConfigStorage::class.java)

        `when`(mockSessionStorage.getSession()).thenReturn(DeviceSession.unpaired())
        `when`(mockConfigStorage.getApiBaseUrl()).thenReturn("http://10.0.2.2:5000/api/v1")

        `when`(mockClient.redeemPairingCode(any(), any())).thenReturn(
            ApiResult.Error("Invalid or expired pairing code.", statusCode = 400)
        )

        val repository = DeviceRepository(
            apiClient = mockClient,
            secureStorage = secureStorage,
            sessionStorage = mockSessionStorage,
            serverConfigStorage = mockConfigStorage,
            heartbeatScheduler = null
        )

        val result = repository.redeemPairingCode("aB3-_dE6hI9kLmNoPqRsTu", "Child Phone")

        assertTrue(result is ApiResult.Error)
        assertFalse(secureStorage.hasDeviceCredential())
        assertFalse(repository.deviceSession.value.isPaired)
    }

    @Test
    fun `heartbeat 401 transitions session to invalid_session without wiping credentials`() = runBlocking {
        val mockClient = mock(KidsGuardApiClient::class.java)
        val secureStorage = MemoryCredentialStorage()
        val mockSessionStorage = mock(SessionStorage::class.java)
        val mockConfigStorage = mock(ServerConfigStorage::class.java)

        val validCredential = "k".repeat(43)
        secureStorage.saveDeviceCredential(validCredential)

        val initialSession = DeviceSession(
            isPaired = true,
            pairingStatus = DeviceSession.STATUS_PAIRED,
            deviceId = "dev_12345",
            deviceName = "Child Phone",
            platform = "android"
        )
        `when`(mockSessionStorage.getSession()).thenReturn(initialSession)
        `when`(mockConfigStorage.getApiBaseUrl()).thenReturn("http://10.0.2.2:5000/api/v1")

        `when`(mockClient.sendHeartbeat(any(), any())).thenReturn(
            ApiResult.Error("Device authentication required or session expired.", statusCode = 401, isAuthError = true)
        )

        val repository = DeviceRepository(
            apiClient = mockClient,
            secureStorage = secureStorage,
            sessionStorage = mockSessionStorage,
            serverConfigStorage = mockConfigStorage,
            heartbeatScheduler = null
        )

        val result = repository.sendHeartbeat()

        assertTrue(result is ApiResult.Error)
        val error = result as ApiResult.Error
        assertEquals(401, error.statusCode)
        assertTrue(error.isAuthError)

        // Session must be marked as invalid_session
        assertEquals(DeviceSession.STATUS_INVALID_SESSION, repository.deviceSession.value.pairingStatus)
        // Credential is preserved so client knows device was previously enrolled
        assertTrue(secureStorage.hasDeviceCredential())
    }

    @Test
    fun `syncAll executes heartbeat, policy sync, and screen-time report successfully`() = runBlocking {
        val mockClient = mock(KidsGuardApiClient::class.java)
        val secureStorage = MemoryCredentialStorage()
        val mockSessionStorage = mock(SessionStorage::class.java)
        val mockConfigStorage = mock(ServerConfigStorage::class.java)
        val policyStorage = MemoryPolicyStorage()
        val policyRepo = PolicyRepository(policyStorage, mockClient)
        val mockUsageReader = mock(UsageStatsReader::class.java)

        val validCredential = "k".repeat(43)
        secureStorage.saveDeviceCredential(validCredential)

        val initialSession = DeviceSession(
            isPaired = true,
            pairingStatus = DeviceSession.STATUS_PAIRED,
            deviceId = "dev_12345",
            deviceName = "Child Phone",
            platform = "android"
        )
        `when`(mockSessionStorage.getSession()).thenReturn(initialSession)
        `when`(mockConfigStorage.getApiBaseUrl()).thenReturn("http://10.0.2.2:5000/api/v1")

        val baseUrl = "http://10.0.2.2:5000/api/v1"

        `when`(mockClient.sendHeartbeat(baseUrl, validCredential)).thenReturn(
            ApiResult.Success(com.kidsguard.child.data.model.HeartbeatResponse(
                DeviceDto("dev_12345", "child_999", "Child Phone", "android", "paired", "2026-10-15T00:00:00Z", "2026-10-15T12:00:00Z")
            ))
        )

        val policy = DevicePolicyResponse(
            policyVersion = 2,
            dailyLimitMinutes = 120,
            quietHoursEnabled = true,
            quietHoursStart = "21:00",
            quietHoursEnd = "07:00",
            quietHoursDays = listOf("monday"),
            webRestrictionsEnabled = true,
            blockedDomains = listOf("badsite.org")
        )
        `when`(mockClient.fetchPolicy(baseUrl, validCredential)).thenReturn(ApiResult.Success(policy))
        `when`(mockClient.acknowledgePolicy(baseUrl, validCredential, 2)).thenReturn(
            ApiResult.Success(PolicyAckResponse(2, "2026-10-15T12:00:00Z"))
        )

        val usageReport = ScreenTimeReportRequest(
            date = "2026-10-15",
            totalScreenTimeSeconds = 3600L,
            reportingPeriod = ReportingPeriodDto("2026-10-15T00:00:00Z", "2026-10-15T12:00:00Z"),
            permissionGranted = true,
            source = "measured",
            appUsage = emptyList()
        )
        `when`(mockUsageReader.measureTodayUsage()).thenReturn(usageReport)
        `when`(mockClient.reportScreenTime(baseUrl, validCredential, usageReport)).thenReturn(ApiResult.Success(Unit))

        val repository = DeviceRepository(
            apiClient = mockClient,
            secureStorage = secureStorage,
            sessionStorage = mockSessionStorage,
            serverConfigStorage = mockConfigStorage,
            heartbeatScheduler = null
        )

        val result = repository.syncAll(policyRepo, mockUsageReader)

        assertTrue(result is ApiResult.Success)
        val updated = (result as ApiResult.Success).data
        assertEquals(2, updated.acknowledgedPolicyVersion)
        assertEquals(120, updated.dailyLimitMinutes)
        assertTrue(updated.quietHoursEnabled)
        assertEquals("21:00 - 07:00", updated.quietHoursRange)
        assertEquals("ok", updated.lastHeartbeatStatus)
        assertNotNull(updated.lastHeartbeatAt)
        assertNotNull(updated.lastPolicySyncAt)
        assertNotNull(updated.lastScreenTimeReportAt)
    }

    @Test
    fun `syncAll partial failure - policy sync fails preserves previous policy timestamp and advances heartbeat and screen-time`() = runBlocking {
        val mockClient = mock(KidsGuardApiClient::class.java)
        val secureStorage = MemoryCredentialStorage()
        val mockSessionStorage = mock(SessionStorage::class.java)
        val mockConfigStorage = mock(ServerConfigStorage::class.java)
        val policyStorage = MemoryPolicyStorage()
        val policyRepo = PolicyRepository(policyStorage, mockClient)
        val mockUsageReader = mock(UsageStatsReader::class.java)

        val validCredential = "k".repeat(43)
        secureStorage.saveDeviceCredential(validCredential)

        val priorPolicyTimestamp = "2026-10-14T10:00:00Z"
        val priorHeartbeatTimestamp = "2026-10-14T10:00:00Z"
        val priorReportTimestamp = "2026-10-14T10:00:00Z"

        val initialSession = DeviceSession(
            isPaired = true,
            pairingStatus = DeviceSession.STATUS_PAIRED,
            deviceId = "dev_12345",
            deviceName = "Child Phone",
            platform = "android",
            lastHeartbeatAt = priorHeartbeatTimestamp,
            lastPolicySyncAt = priorPolicyTimestamp,
            lastScreenTimeReportAt = priorReportTimestamp,
            acknowledgedPolicyVersion = 1
        )
        `when`(mockSessionStorage.getSession()).thenReturn(initialSession)
        `when`(mockConfigStorage.getApiBaseUrl()).thenReturn("http://10.0.2.2:5000/api/v1")
        val baseUrl = "http://10.0.2.2:5000/api/v1"

        // 1. Heartbeat succeeds
        `when`(mockClient.sendHeartbeat(baseUrl, validCredential)).thenReturn(
            ApiResult.Success(com.kidsguard.child.data.model.HeartbeatResponse(
                DeviceDto("dev_12345", "child_999", "Child Phone", "android", "paired", "2026-10-15T00:00:00Z", "2026-10-15T12:00:00Z")
            ))
        )

        // 2. Policy fetch fails with 502 Bad Gateway
        `when`(mockClient.fetchPolicy(baseUrl, validCredential)).thenReturn(
            ApiResult.Error("Bad Gateway", statusCode = 502, isServerError = true)
        )

        // 3. Screen-time report succeeds
        val usageReport = ScreenTimeReportRequest(
            date = "2026-10-15",
            totalScreenTimeSeconds = 1800L,
            reportingPeriod = ReportingPeriodDto("2026-10-15T00:00:00Z", "2026-10-15T12:00:00Z"),
            permissionGranted = true,
            source = "measured",
            appUsage = emptyList()
        )
        `when`(mockUsageReader.measureTodayUsage()).thenReturn(usageReport)
        `when`(mockClient.reportScreenTime(baseUrl, validCredential, usageReport)).thenReturn(ApiResult.Success(Unit))

        val repository = DeviceRepository(
            apiClient = mockClient,
            secureStorage = secureStorage,
            sessionStorage = mockSessionStorage,
            serverConfigStorage = mockConfigStorage,
            heartbeatScheduler = null
        )

        val result = repository.syncAll(policyRepo, mockUsageReader)

        // Outcome accurately reports error because policy sync failed
        assertTrue(result is ApiResult.Error)
        assertEquals(502, (result as ApiResult.Error).statusCode)

        val updated = repository.deviceSession.value
        // Heartbeat succeeded and advanced
        assertNotNull(updated.lastHeartbeatAt)
        assertTrue(updated.lastHeartbeatAt != priorHeartbeatTimestamp)

        // Policy sync failed: timestamp and acknowledged version MUST NOT advance!
        assertEquals(priorPolicyTimestamp, updated.lastPolicySyncAt)
        assertEquals(1, updated.acknowledgedPolicyVersion)

        // Screen-time succeeded and advanced
        assertNotNull(updated.lastScreenTimeReportAt)
        assertTrue(updated.lastScreenTimeReportAt != priorReportTimestamp)

        // Verify session was persisted
        org.mockito.Mockito.verify(mockSessionStorage).saveSession(updated)
    }

    @Test
    fun `syncAll partial failure - screen-time report fails preserves previous screen-time timestamp and advances policy`() = runBlocking {
        val mockClient = mock(KidsGuardApiClient::class.java)
        val secureStorage = MemoryCredentialStorage()
        val mockSessionStorage = mock(SessionStorage::class.java)
        val mockConfigStorage = mock(ServerConfigStorage::class.java)
        val policyStorage = MemoryPolicyStorage()
        val policyRepo = PolicyRepository(policyStorage, mockClient)
        val mockUsageReader = mock(UsageStatsReader::class.java)

        val validCredential = "k".repeat(43)
        secureStorage.saveDeviceCredential(validCredential)

        val priorPolicyTimestamp = "2026-10-14T10:00:00Z"
        val priorReportTimestamp = "2026-10-14T10:00:00Z"

        val initialSession = DeviceSession(
            isPaired = true,
            pairingStatus = DeviceSession.STATUS_PAIRED,
            deviceId = "dev_12345",
            deviceName = "Child Phone",
            platform = "android",
            lastPolicySyncAt = priorPolicyTimestamp,
            lastScreenTimeReportAt = priorReportTimestamp,
            acknowledgedPolicyVersion = 1
        )
        `when`(mockSessionStorage.getSession()).thenReturn(initialSession)
        `when`(mockConfigStorage.getApiBaseUrl()).thenReturn("http://10.0.2.2:5000/api/v1")
        val baseUrl = "http://10.0.2.2:5000/api/v1"

        // 1. Heartbeat succeeds
        `when`(mockClient.sendHeartbeat(baseUrl, validCredential)).thenReturn(
            ApiResult.Success(com.kidsguard.child.data.model.HeartbeatResponse(
                DeviceDto("dev_12345", "child_999", "Child Phone", "android", "paired", "2026-10-15T00:00:00Z", "2026-10-15T12:00:00Z")
            ))
        )

        // 2. Policy sync succeeds with version 2
        val policy = DevicePolicyResponse(
            policyVersion = 2,
            dailyLimitMinutes = 90,
            quietHoursEnabled = false,
            quietHoursStart = "21:00",
            quietHoursEnd = "07:00",
            quietHoursDays = emptyList(),
            webRestrictionsEnabled = true,
            blockedDomains = emptyList()
        )
        `when`(mockClient.fetchPolicy(baseUrl, validCredential)).thenReturn(ApiResult.Success(policy))
        `when`(mockClient.acknowledgePolicy(baseUrl, validCredential, 2)).thenReturn(
            ApiResult.Success(PolicyAckResponse(2, "2026-10-15T12:00:00Z"))
        )

        // 3. Screen-time report fails with 503 Service Unavailable
        val usageReport = ScreenTimeReportRequest(
            date = "2026-10-15",
            totalScreenTimeSeconds = 1800L,
            reportingPeriod = ReportingPeriodDto("2026-10-15T00:00:00Z", "2026-10-15T12:00:00Z"),
            permissionGranted = true,
            source = "measured",
            appUsage = emptyList()
        )
        `when`(mockUsageReader.measureTodayUsage()).thenReturn(usageReport)
        `when`(mockClient.reportScreenTime(baseUrl, validCredential, usageReport)).thenReturn(
            ApiResult.Error("Service Unavailable", statusCode = 503, isServerError = true)
        )

        val repository = DeviceRepository(
            apiClient = mockClient,
            secureStorage = secureStorage,
            sessionStorage = mockSessionStorage,
            serverConfigStorage = mockConfigStorage,
            heartbeatScheduler = null
        )

        val result = repository.syncAll(policyRepo, mockUsageReader)

        // Outcome accurately reports screen-time error
        assertTrue(result is ApiResult.Error)
        assertEquals(503, (result as ApiResult.Error).statusCode)

        val updated = repository.deviceSession.value
        // Policy succeeded: policy timestamp and version advance
        assertNotNull(updated.lastPolicySyncAt)
        assertTrue(updated.lastPolicySyncAt != priorPolicyTimestamp)
        assertEquals(2, updated.acknowledgedPolicyVersion)
        assertEquals(90, updated.dailyLimitMinutes)

        // Screen-time failed: timestamp MUST NOT advance!
        assertEquals(priorReportTimestamp, updated.lastScreenTimeReportAt)

        // Verify session was persisted
        org.mockito.Mockito.verify(mockSessionStorage).saveSession(updated)
    }

    @Test
    fun `syncAll partial failure - policy fetch succeeds but acknowledgement fails does not advance acknowledgedPolicyVersion`() = runBlocking {
        val mockClient = mock(KidsGuardApiClient::class.java)
        val secureStorage = MemoryCredentialStorage()
        val mockSessionStorage = mock(SessionStorage::class.java)
        val mockConfigStorage = mock(ServerConfigStorage::class.java)
        val policyStorage = MemoryPolicyStorage()
        val policyRepo = PolicyRepository(policyStorage, mockClient)
        val mockUsageReader = mock(UsageStatsReader::class.java)

        val validCredential = "k".repeat(43)
        secureStorage.saveDeviceCredential(validCredential)

        val priorPolicyTimestamp = "2026-10-14T10:00:00Z"

        val initialSession = DeviceSession(
            isPaired = true,
            pairingStatus = DeviceSession.STATUS_PAIRED,
            deviceId = "dev_12345",
            deviceName = "Child Phone",
            platform = "android",
            lastPolicySyncAt = priorPolicyTimestamp,
            acknowledgedPolicyVersion = 1
        )
        `when`(mockSessionStorage.getSession()).thenReturn(initialSession)
        `when`(mockConfigStorage.getApiBaseUrl()).thenReturn("http://10.0.2.2:5000/api/v1")
        val baseUrl = "http://10.0.2.2:5000/api/v1"

        // 1. Heartbeat succeeds
        `when`(mockClient.sendHeartbeat(baseUrl, validCredential)).thenReturn(
            ApiResult.Success(com.kidsguard.child.data.model.HeartbeatResponse(
                DeviceDto("dev_12345", "child_999", "Child Phone", "android", "paired", "2026-10-15T00:00:00Z", "2026-10-15T12:00:00Z")
            ))
        )

        // 2. Policy fetch succeeds (version = 3), but acknowledgement fails with 504 Gateway Timeout
        val policy = DevicePolicyResponse(
            policyVersion = 3,
            dailyLimitMinutes = 60,
            quietHoursEnabled = true,
            quietHoursStart = "22:00",
            quietHoursEnd = "06:00",
            quietHoursDays = emptyList(),
            webRestrictionsEnabled = true,
            blockedDomains = emptyList()
        )
        `when`(mockClient.fetchPolicy(baseUrl, validCredential)).thenReturn(ApiResult.Success(policy))
        `when`(mockClient.acknowledgePolicy(baseUrl, validCredential, 3)).thenReturn(
            ApiResult.Error("Gateway Timeout", statusCode = 504, isServerError = true)
        )

        // 3. Screen-time report succeeds
        val usageReport = ScreenTimeReportRequest(
            date = "2026-10-15",
            totalScreenTimeSeconds = 1800L,
            reportingPeriod = ReportingPeriodDto("2026-10-15T00:00:00Z", "2026-10-15T12:00:00Z"),
            permissionGranted = true,
            source = "measured",
            appUsage = emptyList()
        )
        `when`(mockUsageReader.measureTodayUsage()).thenReturn(usageReport)
        `when`(mockClient.reportScreenTime(baseUrl, validCredential, usageReport)).thenReturn(ApiResult.Success(Unit))

        val repository = DeviceRepository(
            apiClient = mockClient,
            secureStorage = secureStorage,
            sessionStorage = mockSessionStorage,
            serverConfigStorage = mockConfigStorage,
            heartbeatScheduler = null
        )

        val result = repository.syncAll(policyRepo, mockUsageReader)

        assertTrue(result is ApiResult.Success)
        val updated = repository.deviceSession.value
        // Policy was fetched: policy timestamp and rules advance
        assertNotNull(updated.lastPolicySyncAt)
        assertTrue(updated.lastPolicySyncAt != priorPolicyTimestamp)
        assertEquals(60, updated.dailyLimitMinutes)
        assertTrue(updated.quietHoursEnabled)

        // Acknowledgment failed: acknowledgedPolicyVersion MUST NOT advance!
        assertEquals(1, updated.acknowledgedPolicyVersion)
    }

    @Test
    fun `syncAll offline failure - heartbeat network error preserves all prior timestamps and marks offline`() = runBlocking {
        val mockClient = mock(KidsGuardApiClient::class.java)
        val secureStorage = MemoryCredentialStorage()
        val mockSessionStorage = mock(SessionStorage::class.java)
        val mockConfigStorage = mock(ServerConfigStorage::class.java)
        val policyStorage = MemoryPolicyStorage()
        val policyRepo = PolicyRepository(policyStorage, mockClient)
        val mockUsageReader = mock(UsageStatsReader::class.java)

        val validCredential = "k".repeat(43)
        secureStorage.saveDeviceCredential(validCredential)

        val priorHeartbeatTimestamp = "2026-10-14T10:00:00Z"
        val priorPolicyTimestamp = "2026-10-14T10:00:00Z"
        val priorReportTimestamp = "2026-10-14T10:00:00Z"

        val initialSession = DeviceSession(
            isPaired = true,
            pairingStatus = DeviceSession.STATUS_PAIRED,
            deviceId = "dev_12345",
            deviceName = "Child Phone",
            platform = "android",
            lastHeartbeatAt = priorHeartbeatTimestamp,
            lastPolicySyncAt = priorPolicyTimestamp,
            lastScreenTimeReportAt = priorReportTimestamp,
            acknowledgedPolicyVersion = 1
        )
        `when`(mockSessionStorage.getSession()).thenReturn(initialSession)
        `when`(mockConfigStorage.getApiBaseUrl()).thenReturn("http://10.0.2.2:5000/api/v1")
        val baseUrl = "http://10.0.2.2:5000/api/v1"

        // Heartbeat fails with network error
        `when`(mockClient.sendHeartbeat(baseUrl, validCredential)).thenReturn(
            ApiResult.Error("Network unavailable.", isNetworkError = true)
        )

        val repository = DeviceRepository(
            apiClient = mockClient,
            secureStorage = secureStorage,
            sessionStorage = mockSessionStorage,
            serverConfigStorage = mockConfigStorage,
            heartbeatScheduler = null
        )

        val result = repository.syncAll(policyRepo, mockUsageReader)

        assertTrue(result is ApiResult.Error)
        val updated = repository.deviceSession.value
        assertEquals("offline", updated.lastHeartbeatStatus)
        // All timestamps preserved
        assertEquals(priorHeartbeatTimestamp, updated.lastHeartbeatAt)
        assertEquals(priorPolicyTimestamp, updated.lastPolicySyncAt)
        assertEquals(priorReportTimestamp, updated.lastScreenTimeReportAt)
        assertEquals(1, updated.acknowledgedPolicyVersion)
    }
}
