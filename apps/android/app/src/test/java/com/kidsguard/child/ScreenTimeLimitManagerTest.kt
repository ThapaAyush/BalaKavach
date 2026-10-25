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

    @Test
    fun isQuietHoursActive_handles12HourAmPmFormatFromParentDashboard() {
        val policy = com.kidsguard.child.data.model.DevicePolicyResponse.defaultPolicy().copy(
            quietHoursEnabled = true,
            quietHoursStart = "09:00 PM",
            quietHoursEnd = "07:00 AM",
            quietHoursDays = listOf("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
        )

        val calLateNight = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.HOUR_OF_DAY, 22)
            set(java.util.Calendar.MINUTE, 30)
        }
        assertTrue(ScreenTimeLimitManager.isQuietHoursActive(policy, calLateNight))

        val calMorning = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.HOUR_OF_DAY, 6)
            set(java.util.Calendar.MINUTE, 0)
        }
        assertTrue(ScreenTimeLimitManager.isQuietHoursActive(policy, calMorning))

        val calAfternoon = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.HOUR_OF_DAY, 14)
            set(java.util.Calendar.MINUTE, 0)
        }
        assertFalse(ScreenTimeLimitManager.isQuietHoursActive(policy, calAfternoon))
    }

    @Test
    fun getOrCreateLimitBaselineSeconds_latchesCurrentUsageAsBaselineForNewLimit() {
        val mockContext = org.mockito.Mockito.mock(android.content.Context::class.java)
        val mockPrefs = org.mockito.Mockito.mock(android.content.SharedPreferences::class.java)
        val mockEditor = org.mockito.Mockito.mock(android.content.SharedPreferences.Editor::class.java)

        org.mockito.Mockito.`when`(mockContext.getSharedPreferences(org.mockito.Mockito.anyString(), org.mockito.Mockito.anyInt())).thenReturn(mockPrefs)
        org.mockito.Mockito.`when`(mockPrefs.edit()).thenReturn(mockEditor)
        org.mockito.Mockito.`when`(mockEditor.putString(org.mockito.Mockito.anyString(), org.mockito.Mockito.anyString())).thenReturn(mockEditor)
        org.mockito.Mockito.`when`(mockEditor.putInt(org.mockito.Mockito.anyString(), org.mockito.Mockito.anyInt())).thenReturn(mockEditor)
        org.mockito.Mockito.`when`(mockEditor.putLong(org.mockito.Mockito.anyString(), org.mockito.Mockito.anyLong())).thenReturn(mockEditor)
        org.mockito.Mockito.`when`(mockEditor.putBoolean(org.mockito.Mockito.anyString(), org.mockito.Mockito.anyBoolean())).thenReturn(mockEditor)

        org.mockito.Mockito.`when`(mockPrefs.getString("limit_date", null)).thenReturn(null)
        org.mockito.Mockito.`when`(mockPrefs.getInt("limit_minutes", -1)).thenReturn(-1)
        org.mockito.Mockito.`when`(mockPrefs.getInt("limit_policy_version", -1)).thenReturn(-1)
        org.mockito.Mockito.`when`(mockPrefs.getLong("limit_baseline_seconds", -1L)).thenReturn(-1L)

        val policy = com.kidsguard.child.data.model.DevicePolicyResponse.defaultPolicy().copy(
            dailyLimitMinutes = 1
        )

        // 3660s (1h 1m) already used earlier today before parent set 1m limit
        val baseline = ScreenTimeLimitManager.getOrCreateLimitBaselineSeconds(mockContext, policy, 3660L)
        assertEquals(3660L, baseline)
    }

    @Test
    fun computeUsedMinutesForLimit_returnsZero_whenNoDailyLimitConfigured() {
        val mockContext = org.mockito.Mockito.mock(android.content.Context::class.java)
        val policyNoLimit = com.kidsguard.child.data.model.DevicePolicyResponse.defaultPolicy().copy(
            dailyLimitMinutes = null
        )
        val usage = com.kidsguard.child.data.model.ScreenTimeReportRequest(
            date = "2026-10-25",
            totalScreenTimeSeconds = 5400L, // 90 min
            reportingPeriod = com.kidsguard.child.data.model.ReportingPeriodDto(
                start = "2026-10-25T00:00:00.000Z",
                end = "2026-10-25T10:00:00.000Z"
            ),
            permissionGranted = true,
            deviceUnlockCount = 5,
            appUsage = emptyList()
        )
        val usedMin = ScreenTimeLimitManager.computeUsedMinutesForLimit(mockContext, policyNoLimit, usage)
        assertEquals(0, usedMin)
    }

    @Test
    fun computeUsedMinutesForLimit_computesTodayTotalUsageCorrectly() {
        val mockContext = org.mockito.Mockito.mock(android.content.Context::class.java)
        val mockPrefs = org.mockito.Mockito.mock(android.content.SharedPreferences::class.java)
        org.mockito.Mockito.`when`(mockContext.getSharedPreferences(org.mockito.Mockito.anyString(), org.mockito.Mockito.anyInt())).thenReturn(mockPrefs)
        org.mockito.Mockito.`when`(mockPrefs.getString(org.mockito.Mockito.anyString(), org.mockito.Mockito.nullable(String::class.java))).thenReturn(null)
        org.mockito.Mockito.`when`(mockPrefs.getLong(org.mockito.Mockito.anyString(), org.mockito.Mockito.anyLong())).thenReturn(0L)

        val policy = com.kidsguard.child.data.model.DevicePolicyResponse.defaultPolicy().copy(
            dailyLimitMinutes = 60
        )
        val usage = com.kidsguard.child.data.model.ScreenTimeReportRequest(
            date = "2026-10-25",
            totalScreenTimeSeconds = 4500L, // 75 min
            reportingPeriod = com.kidsguard.child.data.model.ReportingPeriodDto(
                start = "2026-10-25T00:00:00.000Z",
                end = "2026-10-25T10:00:00.000Z"
            ),
            permissionGranted = true,
            deviceUnlockCount = 10,
            appUsage = emptyList()
        )
        val usedMin = ScreenTimeLimitManager.computeUsedMinutesForLimit(mockContext, policy, usage)
        assertEquals(75, usedMin)

        val eval = ScreenTimeLimitManager.evaluateScreenTimeState(
            dailyLimitMinutes = policy.dailyLimitMinutes,
            usedMinutes = usedMin,
            extensionUntilMs = 0L,
            isLockedToday = false
        )
        assertTrue(eval.isTimeOver)
        assertEquals(75, eval.usedMinutes)
    }

    @Test
    fun computeRemainingSeconds_calculatesExactCountdown_andReachesZero() {
        val mockContext = org.mockito.Mockito.mock(android.content.Context::class.java)
        val mockPrefs = org.mockito.Mockito.mock(android.content.SharedPreferences::class.java)
        org.mockito.Mockito.`when`(mockContext.getSharedPreferences(org.mockito.Mockito.anyString(), org.mockito.Mockito.anyInt())).thenReturn(mockPrefs)
        org.mockito.Mockito.`when`(mockPrefs.getString(org.mockito.Mockito.anyString(), org.mockito.Mockito.nullable(String::class.java))).thenReturn(null)
        org.mockito.Mockito.`when`(mockPrefs.getLong(org.mockito.Mockito.anyString(), org.mockito.Mockito.anyLong())).thenReturn(0L)

        // 2-minute timer limit
        val policy2Min = com.kidsguard.child.data.model.DevicePolicyResponse.defaultPolicy().copy(
            dailyLimitMinutes = 2
        )

        // 50 seconds used -> 70 seconds remaining
        val usage50s = com.kidsguard.child.data.model.ScreenTimeReportRequest(
            date = "2026-10-25",
            totalScreenTimeSeconds = 50L,
            reportingPeriod = com.kidsguard.child.data.model.ReportingPeriodDto(
                start = "2026-10-25T00:00:00.000Z",
                end = "2026-10-25T10:00:00.000Z"
            ),
            permissionGranted = true,
            deviceUnlockCount = 1,
            appUsage = emptyList()
        )
        val remaining70s = ScreenTimeLimitManager.computeRemainingSeconds(mockContext, policy2Min, usage50s)
        assertEquals(70L, remaining70s)

        // 120 seconds used (time reached 00:00)
        val usage120s = usage50s.copy(totalScreenTimeSeconds = 120L)
        val remaining0s = ScreenTimeLimitManager.computeRemainingSeconds(mockContext, policy2Min, usage120s)
        assertEquals(0L, remaining0s)

        // Evaluate at 0 remaining seconds
        val evalExpired = ScreenTimeLimitManager.evaluateScreenTimeState(
            dailyLimitMinutes = 2,
            usedMinutes = 2,
            extensionUntilMs = 0L,
            isLockedToday = false,
            remainingSeconds = remaining0s
        )
        assertTrue(evalExpired.isTimeOver)
        assertEquals(0L, evalExpired.remainingSeconds)
    }
}
