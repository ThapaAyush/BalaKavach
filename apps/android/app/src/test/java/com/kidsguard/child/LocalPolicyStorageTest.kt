package com.kidsguard.child

import com.kidsguard.child.data.local.MemoryPolicyStorage
import com.kidsguard.child.data.model.DevicePolicyResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalPolicyStorageTest {

    @Test
    fun `starts empty and stores parent policy`() {
        val storage = MemoryPolicyStorage()
        assertNull(storage.getCachedPolicy())

        val policy = DevicePolicyResponse(
            policyVersion = 2,
            dailyLimitMinutes = 120,
            quietHoursEnabled = true,
            quietHoursStart = "22:00",
            quietHoursEnd = "06:00",
            quietHoursDays = listOf("monday", "tuesday"),
            webRestrictionsEnabled = true,
            blockedDomains = listOf("badsite.org")
        )

        storage.savePolicy(policy)
        val cached = storage.getCachedPolicy()
        assertNotNull(cached)
        assertEquals(2, cached?.policyVersion)
        assertEquals(120, cached?.dailyLimitMinutes)
        assertTrue(cached?.quietHoursEnabled == true)
        assertEquals(listOf("badsite.org"), cached?.blockedDomains)
    }

    @Test
    fun `clearPolicy resets cached policy`() {
        val storage = MemoryPolicyStorage()
        val policy = DevicePolicyResponse.defaultPolicy()
        storage.savePolicy(policy)
        assertNotNull(storage.getCachedPolicy())

        storage.clearPolicy()
        assertNull(storage.getCachedPolicy())
    }
}
