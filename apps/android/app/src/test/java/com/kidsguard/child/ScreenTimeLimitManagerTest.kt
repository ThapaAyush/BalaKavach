package com.kidsguard.child

import com.kidsguard.child.domain.rules.ScreenTimeLimitManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScreenTimeLimitManagerTest {

    @Test
    fun evaluateScreenTimeState_returnsFalse_whenNoLimitConfigured() {
        val resultNull = ScreenTimeLimitManager.evaluateScreenTimeState(
            dailyLimitMinutes = null,
            usedMinutes = 120,
            extensionUntilMs = 0L,
            isLockedToday = false
        )
        assertFalse(resultNull.isTimeOver)
        assertFalse(resultNull.isLocked)

        val resultZero = ScreenTimeLimitManager.evaluateScreenTimeState(
            dailyLimitMinutes = 0,
            usedMinutes = 10,
            extensionUntilMs = 0L,
            isLockedToday = false
        )
        assertFalse(resultZero.isTimeOver)
    }

    @Test
    fun evaluateScreenTimeState_returnsFalse_whenWithinBudget() {
        val result = ScreenTimeLimitManager.evaluateScreenTimeState(
            dailyLimitMinutes = 60,
            usedMinutes = 45,
            extensionUntilMs = 0L,
            isLockedToday = false
        )
        assertFalse(result.isTimeOver)
        assertFalse(result.isLocked)
        assertFalse(result.isExtensionActive)
    }

    @Test
    fun evaluateScreenTimeState_returnsTrue_whenLimitReached_andNoExtension() {
        // Test parent set 1 minute limit (as shown in user screenshot)
        val result1Min = ScreenTimeLimitManager.evaluateScreenTimeState(
            dailyLimitMinutes = 1,
            usedMinutes = 1,
            extensionUntilMs = 0L,
            isLockedToday = false
        )
        assertTrue(result1Min.isTimeOver)
        assertFalse(result1Min.isLocked)
        assertFalse(result1Min.isExtensionActive)

        // Test general limit (e.g. 120 mins)
        val result120Min = ScreenTimeLimitManager.evaluateScreenTimeState(
            dailyLimitMinutes = 120,
            usedMinutes = 125,
            extensionUntilMs = 0L,
            isLockedToday = false
        )
        assertTrue(result120Min.isTimeOver)
    }

    @Test
    fun evaluateScreenTimeState_handles5MinMoreExtension_andReTriggersAfter5Min() {
        val now = 1000000L
        val fiveMinutesMs = 5 * 60 * 1000L
        val extensionUntil = now + fiveMinutesMs

        // 1. Before clicking 5 min more: time is over
        val beforeExtension = ScreenTimeLimitManager.evaluateScreenTimeState(
            dailyLimitMinutes = 1,
            usedMinutes = 2,
            extensionUntilMs = 0L,
            isLockedToday = false,
            nowMs = now
        )
        assertTrue(beforeExtension.isTimeOver)

        // 2. Child clicks "+5 min more": extension is active, phone is usable
        val duringExtension = ScreenTimeLimitManager.evaluateScreenTimeState(
            dailyLimitMinutes = 1,
            usedMinutes = 2,
            extensionUntilMs = extensionUntil,
            isLockedToday = false,
            nowMs = now + 60000L // 1 minute in
        )
        assertFalse(duringExtension.isTimeOver)
        assertTrue(duringExtension.isExtensionActive)
        assertEquals(240L, duringExtension.extensionRemainingSeconds) // 4 min remaining

        // 3. Exactly after 5 minutes elapse: extension expires and reminder appears again!
        val after5Minutes = ScreenTimeLimitManager.evaluateScreenTimeState(
            dailyLimitMinutes = 1,
            usedMinutes = 2,
            extensionUntilMs = extensionUntil,
            isLockedToday = false,
            nowMs = extensionUntil + 1000L // 1 second after 5 min
        )
        assertTrue(after5Minutes.isTimeOver)
        assertFalse(after5Minutes.isExtensionActive)
    }

    @Test
    fun evaluateScreenTimeState_whenChildClicksOk_locksDeviceAndShutsOffApps() {
        // Child tapped OK: isLockedToday is true
        val lockedState = ScreenTimeLimitManager.evaluateScreenTimeState(
            dailyLimitMinutes = 60,
            usedMinutes = 60,
            extensionUntilMs = 0L,
            isLockedToday = true
        )
        assertTrue(lockedState.isTimeOver)
        assertTrue(lockedState.isLocked)
        assertFalse(lockedState.isExtensionActive)

        // Even if an extension timestamp existed, locking overrides it
        val lockedOverrides = ScreenTimeLimitManager.evaluateScreenTimeState(
            dailyLimitMinutes = 60,
            usedMinutes = 60,
            extensionUntilMs = System.currentTimeMillis() + 60000L,
            isLockedToday = true
        )
        assertTrue(lockedOverrides.isTimeOver)
        assertTrue(lockedOverrides.isLocked)
    }

    @Test
    fun isQuietHoursActive_returnsTrue_whenWithinQuietHoursWindow() {
        val policy = com.kidsguard.child.data.model.DevicePolicyResponse.defaultPolicy().copy(
            quietHoursEnabled = true,
            quietHoursStart = "09:00",
            quietHoursEnd = "13:00",
            quietHoursDays = listOf("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
        )

        // 10:30 AM on Monday (inside 09:00 - 13:00) -> Active
        val calInside = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.DAY_OF_WEEK, java.util.Calendar.MONDAY)
            set(java.util.Calendar.HOUR_OF_DAY, 10)
            set(java.util.Calendar.MINUTE, 30)
        }
        assertTrue(ScreenTimeLimitManager.isQuietHoursActive(policy, calInside))

        // 08:30 AM on Monday (before 09:00) -> Inactive
        val calBefore = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.DAY_OF_WEEK, java.util.Calendar.MONDAY)
            set(java.util.Calendar.HOUR_OF_DAY, 8)
            set(java.util.Calendar.MINUTE, 30)
        }
        assertFalse(ScreenTimeLimitManager.isQuietHoursActive(policy, calBefore))

        // 01:30 PM (13:30) on Monday (after 13:00) -> Inactive
        val calAfter = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.DAY_OF_WEEK, java.util.Calendar.MONDAY)
            set(java.util.Calendar.HOUR_OF_DAY, 13)
            set(java.util.Calendar.MINUTE, 30)
        }
        assertFalse(ScreenTimeLimitManager.isQuietHoursActive(policy, calAfter))
    }

    @Test
    fun isQuietHoursActive_returnsFalse_whenQuietHoursDisabled() {
        val policy = com.kidsguard.child.data.model.DevicePolicyResponse.defaultPolicy().copy(
            quietHoursEnabled = false,
            quietHoursStart = "09:00",
            quietHoursEnd = "13:00"
        )
        val cal = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.HOUR_OF_DAY, 10)
            set(java.util.Calendar.MINUTE, 0)
        }
        assertFalse(ScreenTimeLimitManager.isQuietHoursActive(policy, cal))
    }

    @Test
    fun isQuietHoursActive_handlesOvernightWindow() {
        val policy = com.kidsguard.child.data.model.DevicePolicyResponse.defaultPolicy().copy(
            quietHoursEnabled = true,
            quietHoursStart = "21:00",
            quietHoursEnd = "07:00",
            quietHoursDays = listOf("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
        )

        val calLateNight = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.HOUR_OF_DAY, 23)
            set(java.util.Calendar.MINUTE, 15)
        }
        assertTrue(ScreenTimeLimitManager.isQuietHoursActive(policy, calLateNight))

        val calEarlyMorning = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.HOUR_OF_DAY, 5)
            set(java.util.Calendar.MINUTE, 30)
        }
        assertTrue(ScreenTimeLimitManager.isQuietHoursActive(policy, calEarlyMorning))

        val calAfternoon = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.HOUR_OF_DAY, 14)
            set(java.util.Calendar.MINUTE, 0)
        }
        assertFalse(ScreenTimeLimitManager.isQuietHoursActive(policy, calAfternoon))
    }
}
