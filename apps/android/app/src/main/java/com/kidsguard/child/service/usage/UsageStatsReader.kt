package com.kidsguard.child.service.usage

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import com.kidsguard.child.data.model.AppUsageItemDto
import com.kidsguard.child.data.model.ReportingPeriodDto
import com.kidsguard.child.data.model.ScreenTimeReportRequest
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Representation of a usage event for aggregation and testing.
 */
data class UsageEventRecord(
    val packageName: String,
    val timeStamp: Long,
    val eventType: Int
)

/**
 * Interface defining screen-time usage stats retrieval.
 */
interface UsageStatsReader {
    fun hasPermission(): Boolean
    fun measureTodayUsage(): ScreenTimeReportRequest
}

/**
 * Helper utilities for Android UsageStatsManager permission and intent handling.
 */
object UsageStatsHelper {

    fun hasUsageAccessPermission(context: Context): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager ?: return false
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                Process.myUid(),
                context.packageName
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    fun createUsageAccessSettingsIntent(): Intent {
        return Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
    }

    /**
     * Pure function to aggregate usage events without double-counting.
     * Tracks only the single active foreground package at any moment in time.
     */
    fun aggregateEvents(
        events: List<UsageEventRecord>,
        startTimeMs: Long,
        endTimeMs: Long
    ): Map<String, Long> {
        val appDurationsMs = mutableMapOf<String, Long>()
        var activePackage: String? = null
        var activeStartTimeMs: Long = startTimeMs

        // Sort events strictly by timestamp
        val sortedEvents = events.sortedBy { it.timeStamp }

        for (event in sortedEvents) {
            if (event.timeStamp < startTimeMs || event.timeStamp > endTimeMs) {
                continue
            }

            when (event.eventType) {
                UsageEvents.Event.ACTIVITY_RESUMED -> {
                    // If an app was previously active, close its interval
                    if (activePackage != null) {
                        val duration = (event.timeStamp - activeStartTimeMs).coerceAtLeast(0L)
                        appDurationsMs[activePackage] = (appDurationsMs[activePackage] ?: 0L) + duration
                    }
                    activePackage = event.packageName
                    activeStartTimeMs = event.timeStamp
                }
                UsageEvents.Event.ACTIVITY_PAUSED, UsageEvents.Event.ACTIVITY_STOPPED -> {
                    if (activePackage == event.packageName) {
                        val duration = (event.timeStamp - activeStartTimeMs).coerceAtLeast(0L)
                        appDurationsMs[activePackage] = (appDurationsMs[activePackage] ?: 0L) + duration
                        activePackage = null
                    }
                }
            }
        }

        // If an app is still in foreground at endTimeMs, close its interval
        if (activePackage != null && endTimeMs > activeStartTimeMs) {
            val duration = (endTimeMs - activeStartTimeMs).coerceAtLeast(0L)
            appDurationsMs[activePackage] = (appDurationsMs[activePackage] ?: 0L) + duration
        }

        // Convert milliseconds to whole seconds
        return appDurationsMs.mapValues { it.value / 1000L }.filterValues { it > 0L }
    }
}

/**
 * Production implementation using Android UsageStatsManager.
 */
class AndroidUsageStatsReader(
    private val context: Context,
    private val nowProvider: () -> Long = { System.currentTimeMillis() }
) : UsageStatsReader {

    override fun hasPermission(): Boolean {
        return UsageStatsHelper.hasUsageAccessPermission(context)
    }

    override fun measureTodayUsage(): ScreenTimeReportRequest {
        val nowMs = nowProvider()
        val calendar = Calendar.getInstance().apply {
            timeInMillis = nowMs
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val startOfDayMs = calendar.timeInMillis

        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }

        val dateStr = dateFormat.format(Date(nowMs))
        val periodStartStr = isoFormat.format(Date(startOfDayMs))
        val periodEndStr = isoFormat.format(Date(nowMs))
        val reportingPeriod = ReportingPeriodDto(start = periodStartStr, end = periodEndStr)

        if (!hasPermission()) {
            // Strictly zero-fabrication: null screen time when permission is denied
            return ScreenTimeReportRequest(
                date = dateStr,
                totalScreenTimeSeconds = null,
                reportingPeriod = reportingPeriod,
                permissionGranted = false,
                source = "unavailable",
                appUsage = emptyList()
            )
        }

        val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
        if (usageStatsManager == null) {
            return ScreenTimeReportRequest(
                date = dateStr,
                totalScreenTimeSeconds = null,
                reportingPeriod = reportingPeriod,
                permissionGranted = false,
                source = "unavailable",
                appUsage = emptyList()
            )
        }

        val eventsList = mutableListOf<UsageEventRecord>()
        try {
            val usageEvents = usageStatsManager.queryEvents(startOfDayMs, nowMs)
            val event = UsageEvents.Event()
            while (usageEvents.hasNextEvent()) {
                usageEvents.getNextEvent(event)
                eventsList.add(
                    UsageEventRecord(
                        packageName = event.packageName,
                        timeStamp = event.timeStamp,
                        eventType = event.eventType
                    )
                )
            }
        } catch (_: Exception) {
            return ScreenTimeReportRequest(
                date = dateStr,
                totalScreenTimeSeconds = null,
                reportingPeriod = reportingPeriod,
                permissionGranted = false,
                source = "incomplete",
                appUsage = emptyList()
            )
        }

        val aggregatedSeconds = UsageStatsHelper.aggregateEvents(eventsList, startOfDayMs, nowMs)
        val packageManager = context.packageManager

        // Count app opens from ACTIVITY_RESUMED events and device screen unlocks
        val appOpenCounts = mutableMapOf<String, Int>()
        var screenInteractiveEvents = 0
        for (event in eventsList) {
            if (event.timeStamp in startOfDayMs..nowMs) {
                if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                    appOpenCounts[event.packageName] = (appOpenCounts[event.packageName] ?: 0) + 1
                }
                // 15 = SCREEN_INTERACTIVE, 18 = KEYGUARD_HIDDEN
                if (event.eventType == 15 || event.eventType == 18) {
                    screenInteractiveEvents++
                }
            }
        }

        val liveUnlocks = com.kidsguard.child.domain.rules.ScreenTimeLimitManager.getDeviceUnlockCount(context, nowMs)
        val deviceUnlockCount = maxOf(screenInteractiveEvents, liveUnlocks)

        val appUsageItems = aggregatedSeconds.entries
            .map { (pkg, durationSec) ->
                val rawLabel = try {
                    val appInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        packageManager.getApplicationInfo(pkg, PackageManager.ApplicationInfoFlags.of(0))
                    } else {
                        @Suppress("DEPRECATION")
                        packageManager.getApplicationInfo(pkg, 0)
                    }
                    packageManager.getApplicationLabel(appInfo).toString()
                } catch (_: Exception) {
                    null
                }
                val label = com.kidsguard.child.util.AppDisplayNames.formatAppDisplayName(rawLabel, pkg)
                val trackedOpens = com.kidsguard.child.domain.rules.ScreenTimeLimitManager.getAppOpenCount(context, pkg, nowMs)
                val opens = maxOf(appOpenCounts[pkg] ?: 0, trackedOpens)
                AppUsageItemDto(
                    packageName = pkg,
                    appName = label.take(100),
                    durationSeconds = durationSec,
                    openCount = opens
                )
            }
            .sortedByDescending { it.durationSeconds }
            .take(50)

        // Total measured screen-time: sum of non-overlapping foreground durations
        val totalSeconds = appUsageItems.sumOf { it.durationSeconds }.coerceAtMost(86400L)

        return ScreenTimeReportRequest(
            date = dateStr,
            totalScreenTimeSeconds = totalSeconds,
            reportingPeriod = reportingPeriod,
            permissionGranted = true,
            source = "measured",
            appUsage = appUsageItems,
            deviceUnlockCount = deviceUnlockCount
        )
    }
}
