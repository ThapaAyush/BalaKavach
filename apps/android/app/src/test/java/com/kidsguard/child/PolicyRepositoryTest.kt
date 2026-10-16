package com.kidsguard.child

import com.kidsguard.child.data.local.MemoryPolicyStorage
import com.kidsguard.child.data.model.ApiResult
import com.kidsguard.child.data.model.DevicePolicyResponse
import com.kidsguard.child.data.model.PolicyAckResponse
import com.kidsguard.child.data.remote.KidsGuardApiClient
import com.kidsguard.child.data.repository.PolicyRepository
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`

class PolicyRepositoryTest {

    @Test
    fun `syncPolicy fetches policy, saves locally, and acknowledges version`(): Unit = runBlocking {
        val mockClient = mock(KidsGuardApiClient::class.java)
        val storage = MemoryPolicyStorage()
        val repository = PolicyRepository(storage, mockClient)

        val samplePolicy = DevicePolicyResponse(
            policyVersion = 3,
            dailyLimitMinutes = 90,
            quietHoursEnabled = false,
            quietHoursStart = "21:00",
            quietHoursEnd = "07:00",
            quietHoursDays = emptyList(),
            webRestrictionsEnabled = true,
            blockedDomains = listOf("distracting.example")
        )

        val baseUrl = "http://10.0.2.2:5000/api/v1"
        val credential = "k".repeat(43)

        `when`(mockClient.fetchPolicy(baseUrl, credential)).thenReturn(ApiResult.Success(samplePolicy))
        `when`(mockClient.acknowledgePolicy(baseUrl, credential, 3)).thenReturn(
            ApiResult.Success(PolicyAckResponse(3, "2026-10-15T10:00:00Z"))
        )

        val result = repository.syncPolicy(baseUrl, credential)

        assertTrue(result is ApiResult.Success)
        assertEquals(3, (result as ApiResult.Success).data.policyVersion)

        // Stored locally in memory
        val cached = storage.getCachedPolicy()
        assertNotNull(cached)
        assertEquals(3, cached?.policyVersion)
        assertEquals(90, cached?.dailyLimitMinutes)

        // StateFlow updated
        assertEquals(3, repository.cachedPolicy.value?.policyVersion)

        // Verify acknowledgment sent to server
        verify(mockClient).acknowledgePolicy(baseUrl, credential, 3)
        Unit
    }

    @Test
    fun `syncPolicy reports error and preserves cache when server is offline`(): Unit = runBlocking {
        val mockClient = mock(KidsGuardApiClient::class.java)
        val storage = MemoryPolicyStorage()
        val initialPolicy = DevicePolicyResponse.defaultPolicy()
        storage.savePolicy(initialPolicy)

        val repository = PolicyRepository(storage, mockClient)
        val baseUrl = "http://10.0.2.2:5000/api/v1"
        val credential = "k".repeat(43)

        `when`(mockClient.fetchPolicy(baseUrl, credential)).thenReturn(
            ApiResult.Error("Network unavailable.", isNetworkError = true)
        )

        val result = repository.syncPolicy(baseUrl, credential)

        assertTrue(result is ApiResult.Error)
        // Existing cached policy remains intact
        assertEquals(1, repository.cachedPolicy.value?.policyVersion)
        Unit
    }
}
