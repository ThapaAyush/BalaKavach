package com.kidsguard.child.domain.rules

import android.content.Context
import android.content.SharedPreferences
import com.kidsguard.child.data.model.DevicePolicyResponse
import com.kidsguard.child.data.model.ScreenTimeReportRequest
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Manages daily screen-time limit enforcement, 5-minute snooze extensions,
 * and lock-out state for the child mobile companion application.
 */
object ScreenTimeLimitManager {

    private const val PREFS_NAME = "kidsguard_screen_time_limit_prefs"
    private const val KEY_LOCKED_DATE = "locked_date"
    private const val KEY_IS_LOCKED = "is_locked"
    private const val KEY_EXTENSION_UNTIL_MS = "extension_until_ms"
    private const val KEY_EXTENSION_DATE = "extension_date"
    private const val KEY_LIVE_SECONDS_DATE = "live_seconds_date"
    private const val KEY_LIVE_SECONDS_TODAY = "live_seconds_today"
    private const val KEY_LAST_POPUP_TIMESTAMP = "last_popup_timestamp"

    private fun getPrefs(context: Context): SharedPreferences {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    private fun getTodayDateString(nowMs: Long = System.currentTimeMillis()): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        return sdf.format(Date(nowMs))
    }

    /**
     * Pure function to determine if screen time is over based on limit, used minutes, and extension timestamp.
     */
    fun evaluateScreenTimeState(
        dailyLimitMinutes: Int?,
        usedMinutes: Int,
        extensionUntilMs: Long,
        isLockedToday: Boolean,
        nowMs: Long = System.currentTimeMillis()
    ): ScreenTimeEvaluationResult {
        if (isLockedToday) {
            return ScreenTimeEvaluationResult(
                isTimeOver = true,
                isLocked = true,
                isExtensionActive = false,
                reason = "Device locked for today by user."
            )
        }

        if (dailyLimitMinutes == null || dailyLimitMinutes <= 0) {
            return ScreenTimeEvaluationResult(
                isTimeOver = false,
                isLocked = false,
                isExtensionActive = false,
                reason = "No daily limit configured."
            )
        }

        // If usage has not reached the budget yet
        if (usedMinutes < dailyLimitMinutes) {
            return ScreenTimeEvaluationResult(
                isTimeOver = false,
                isLocked = false,
                isExtensionActive = false,
                reason = "Usage ($usedMinutes m) is within daily budget ($dailyLimitMinutes m)."
            )
        }

        // Usage has reached or exceeded the budget. Check if a 5-minute extension is currently active
        val hasActiveExtension = extensionUntilMs > nowMs
        if (hasActiveExtension) {
            val remainingSec = (extensionUntilMs - nowMs) / 1000L
            return ScreenTimeEvaluationResult(
                isTimeOver = false,
                isLocked = false,
                isExtensionActive = true,
                extensionRemainingSeconds = remainingSec,
                reason = "Temporary extension active ($remainingSec seconds remaining)."
            )
        }

        // Budget reached and no active extension -> Time is over!
        return ScreenTimeEvaluationResult(
            isTimeOver = true,
            isLocked = false,
            isExtensionActive = false,
            reason = "Daily limit reached ($usedMinutes m >= $dailyLimitMinutes m) with no active extension."
        )
    }

    /**
     * Checks whether screen time is over for the device right now.
     */
    fun isScreenTimeOver(
        context: Context,
        policy: DevicePolicyResponse?,
        usage: ScreenTimeReportRequest?,
        nowMs: Long = System.currentTimeMillis()
    ): Boolean {
        val result = checkScreenTime(context, policy, usage, nowMs)
        return result.isTimeOver
    }

    /**
     * Full evaluation for UI and blocking services.
     */
    fun checkScreenTime(
        context: Context,
        policy: DevicePolicyResponse?,
        usage: ScreenTimeReportRequest?,
        nowMs: Long = System.currentTimeMillis()
    ): ScreenTimeEvaluationResult {
        val prefs = getPrefs(context)
        val today = getTodayDateString(nowMs)

        // Reset stale flags if day changed
        val lockedDate = prefs.getString(KEY_LOCKED_DATE, null)
        val isLocked = if (lockedDate == today) {
            prefs.getBoolean(KEY_IS_LOCKED, false)
        } else {
            false
        }

        val extensionDate = prefs.getString(KEY_EXTENSION_DATE, null)
        val extensionUntilMs = if (extensionDate == today) {
            prefs.getLong(KEY_EXTENSION_UNTIL_MS, 0L)
        } else {
            0L
        }

        val measuredMinutes = if (usage?.totalScreenTimeSeconds != null) {
            (usage.totalScreenTimeSeconds / 60).toInt()
        } else {
            0
        }

        val liveSeconds = getLiveForegroundSeconds(context, nowMs)
        val liveMinutes = (liveSeconds / 60).toInt()
        val effectiveUsedMinutes = maxOf(measuredMinutes, liveMinutes)

        return evaluateScreenTimeState(
            dailyLimitMinutes = policy?.dailyLimitMinutes,
            usedMinutes = effectiveUsedMinutes,
            extensionUntilMs = extensionUntilMs,
            isLockedToday = isLocked,
            nowMs = nowMs
        )
    }

    /**
     * Child taps "+5 min more". Grants 5 minutes of extra screen time.
     */
    fun grantExtension(
        context: Context,
        minutes: Int = 5,
        nowMs: Long = System.currentTimeMillis()
    ) {
        val prefs = getPrefs(context)
        val today = getTodayDateString(nowMs)
        val extensionUntil = nowMs + (minutes * 60 * 1000L)

        prefs.edit()
            .putString(KEY_EXTENSION_DATE, today)
            .putLong(KEY_EXTENSION_UNTIL_MS, extensionUntil)
            .putBoolean(KEY_IS_LOCKED, false)
            .apply()
    }

    /**
     * Child taps "OK". Locks the device for the remainder of today,
     * closing all apps and returning to the home screen.
     */
    fun lockDeviceForToday(
        context: Context,
        nowMs: Long = System.currentTimeMillis()
    ) {
        val prefs = getPrefs(context)
        val today = getTodayDateString(nowMs)

        prefs.edit()
            .putString(KEY_LOCKED_DATE, today)
            .putBoolean(KEY_IS_LOCKED, true)
            .putLong(KEY_EXTENSION_UNTIL_MS, 0L)
            .apply()
    }

    /**
     * Checks if the device is locked for today.
     */
    fun isLockedForToday(
        context: Context,
        nowMs: Long = System.currentTimeMillis()
    ): Boolean {
        val prefs = getPrefs(context)
        val today = getTodayDateString(nowMs)
        val lockedDate = prefs.getString(KEY_LOCKED_DATE, null)
        return lockedDate == today && prefs.getBoolean(KEY_IS_LOCKED, false)
    }

    /**
     * Checks if a temporary extension is currently active.
     */
    fun isExtensionActive(
        context: Context,
        nowMs: Long = System.currentTimeMillis()
    ): Boolean {
        val prefs = getPrefs(context)
        val today = getTodayDateString(nowMs)
        val extensionDate = prefs.getString(KEY_EXTENSION_DATE, null)
        if (extensionDate != today) return false
        val extensionUntilMs = prefs.getLong(KEY_EXTENSION_UNTIL_MS, 0L)
        return extensionUntilMs > nowMs
    }

    /**
     * Tracks live foreground seconds to react instantly without waiting for OS UsageEvents flush.
     */
    fun addLiveForegroundSeconds(
        context: Context,
        seconds: Long,
        nowMs: Long = System.currentTimeMillis()
    ) {
        if (seconds <= 0L) return
        val prefs = getPrefs(context)
        val today = getTodayDateString(nowMs)
        val recordedDate = prefs.getString(KEY_LIVE_SECONDS_DATE, null)

        val currentSeconds = if (recordedDate == today) {
            prefs.getLong(KEY_LIVE_SECONDS_TODAY, 0L)
        } else {
            0L
        }

        prefs.edit()
            .putString(KEY_LIVE_SECONDS_DATE, today)
            .putLong(KEY_LIVE_SECONDS_TODAY, currentSeconds + seconds)
            .apply()
    }

    fun getLiveForegroundSeconds(
        context: Context,
        nowMs: Long = System.currentTimeMillis()
    ): Long {
        val prefs = getPrefs(context)
        val today = getTodayDateString(nowMs)
        val recordedDate = prefs.getString(KEY_LIVE_SECONDS_DATE, null)
        return if (recordedDate == today) {
            prefs.getLong(KEY_LIVE_SECONDS_TODAY, 0L)
        } else {
            0L
        }
    }

    /**
     * Prevents triggering multiple popup dialogs in the same 5-second window.
     */
    fun canShowPopupNow(
        context: Context,
        nowMs: Long = System.currentTimeMillis(),
        cooldownMs: Long = 5_000L
    ): Boolean {
        val prefs = getPrefs(context)
        val lastTime = prefs.getLong(KEY_LAST_POPUP_TIMESTAMP, 0L)
        if ((nowMs - lastTime) >= cooldownMs) {
            prefs.edit().putLong(KEY_LAST_POPUP_TIMESTAMP, nowMs).apply()
            return true
        }
        return false
    }

    /**
     * Records a mobile device screen open / unlock event for today.
     */
    fun recordDeviceUnlock(
        context: Context,
        nowMs: Long = System.currentTimeMillis()
    ) {
        val prefs = getPrefs(context)
        val today = getTodayDateString(nowMs)
        val recordedDate = prefs.getString("unlock_date", null)
        val currentCount = if (recordedDate == today) {
            prefs.getInt("device_unlock_count", 0)
        } else {
            0
        }
        prefs.edit()
            .putString("unlock_date", today)
            .putInt("device_unlock_count", currentCount + 1)
            .apply()
    }

    fun getDeviceUnlockCount(
        context: Context,
        nowMs: Long = System.currentTimeMillis()
    ): Int {
        val prefs = getPrefs(context)
        val today = getTodayDateString(nowMs)
        val recordedDate = prefs.getString("unlock_date", null)
        return if (recordedDate == today) {
            prefs.getInt("device_unlock_count", 0)
        } else {
            0
        }
    }

    /**
     * Records when an application is opened/resumed.
     */
    fun recordAppOpen(
        context: Context,
        packageName: String,
        nowMs: Long = System.currentTimeMillis()
    ) {
        if (packageName.isBlank()) return
        val prefs = getPrefs(context)
        val today = getTodayDateString(nowMs)
        val recordedDate = prefs.getString("app_open_date", null)
        val key = "app_open_${packageName}"
        val currentCount = if (recordedDate == today) {
            prefs.getInt(key, 0)
        } else {
            0
        }
        val editor = prefs.edit()
        if (recordedDate != today) {
            editor.putString("app_open_date", today)
        }
        editor.putInt(key, currentCount + 1).apply()
    }

    fun getAppOpenCount(
        context: Context,
        packageName: String,
        nowMs: Long = System.currentTimeMillis()
    ): Int {
        val prefs = getPrefs(context)
        val today = getTodayDateString(nowMs)
        val recordedDate = prefs.getString("app_open_date", null)
        return if (recordedDate == today) {
            prefs.getInt("app_open_${packageName}", 0)
        } else {
            0
        }
    }

    /**
     * Evaluates whether parental quiet hours / bedtime window is active right now.
     */
    fun isQuietHoursActive(
        policy: DevicePolicyResponse?,
        now: Calendar = Calendar.getInstance()
    ): Boolean {
        if (policy == null || !policy.quietHoursEnabled) {
            return false
        }

        val startStr = policy.quietHoursStart ?: return false
        val endStr = policy.quietHoursEnd ?: return false

        val (startH, startM) = parseHourMinute(startStr) ?: return false
        val (endH, endM) = parseHourMinute(endStr) ?: return false

        val currentMinutes = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
        val startMinutes = startH * 60 + startM
        val endMinutes = endH * 60 + endM

        val dayName = when (now.get(Calendar.DAY_OF_WEEK)) {
            Calendar.SUNDAY -> "sunday"
            Calendar.MONDAY -> "monday"
            Calendar.TUESDAY -> "tuesday"
            Calendar.WEDNESDAY -> "wednesday"
            Calendar.THURSDAY -> "thursday"
            Calendar.FRIDAY -> "friday"
            Calendar.SATURDAY -> "saturday"
            else -> ""
        }

        val activeDays = policy.quietHoursDays.map { it.lowercase() }
        val isDayActive = activeDays.isEmpty() || activeDays.contains(dayName)

        return if (startMinutes < endMinutes) {
            isDayActive && (currentMinutes in startMinutes until endMinutes)
        } else if (startMinutes > endMinutes) {
            if (currentMinutes >= startMinutes && isDayActive) {
                true
            } else if (currentMinutes < endMinutes) {
                val prevDay = when (now.get(Calendar.DAY_OF_WEEK)) {
                    Calendar.SUNDAY -> "saturday"
                    Calendar.MONDAY -> "sunday"
                    Calendar.TUESDAY -> "monday"
                    Calendar.WEDNESDAY -> "tuesday"
                    Calendar.THURSDAY -> "wednesday"
                    Calendar.FRIDAY -> "thursday"
                    Calendar.SATURDAY -> "friday"
                    else -> ""
                }
                activeDays.isEmpty() || activeDays.contains(prevDay)
            } else {
                false
            }
        } else {
            isDayActive
        }
    }

    fun parseHourMinute(timeStr: String): Pair<Int, Int>? {
        val parts = timeStr.trim().split(":")
        if (parts.size != 2) return null
        val h = parts[0].toIntOrNull() ?: return null
        val m = parts[1].toIntOrNull() ?: return null
        if (h !in 0..23 || m !in 0..59) return null
        return Pair(h, m)
    }

    fun formatTime12Hour(time24: String?): String {
        if (time24.isNullOrBlank()) return "—"
        val parts = time24.trim().split(":")
        if (parts.size != 2) return time24
        val h = parts[0].toIntOrNull() ?: return time24
        val m = parts[1].toIntOrNull() ?: return time24
        val period = if (h < 12) "AM" else "PM"
        val displayH = when {
            h == 0 -> 12
            h > 12 -> h - 12
            else -> h
        }
        return String.format(Locale.US, "%02d:%02d %s", displayH, m, period)
    }

    fun formatQuietHoursWindow(start: String?, end: String?): String {
        return "${formatTime12Hour(start)} – ${formatTime12Hour(end)}"
    }

    /**
     * For tests: clear all stored preferences.
     */
    fun clearAll(context: Context) {
        getPrefs(context).edit().clear().apply()
    }
}

data class ScreenTimeEvaluationResult(
    val isTimeOver: Boolean,
    val isLocked: Boolean,
    val isExtensionActive: Boolean,
    val extensionRemainingSeconds: Long = 0L,
    val reason: String = ""
)
