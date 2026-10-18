package com.kidsguard.child.data.model

import org.json.JSONArray
import org.json.JSONObject

/**
 * App usage breakdown entry with duration and open/launch counts
 */
data class AppUsageItemDto(
    val packageName: String,
    val appName: String,
    val durationSeconds: Long,
    val openCount: Int = 0
) {
    fun toJsonObject(): JSONObject {
        val obj = JSONObject()
        obj.put("packageName", packageName)
        obj.put("appName", appName)
        obj.put("durationSeconds", durationSeconds)
        obj.put("openCount", openCount)
        return obj
    }

    companion object {
        fun fromJson(json: JSONObject): AppUsageItemDto {
            return AppUsageItemDto(
                packageName = json.getString("packageName"),
                appName = json.getString("appName"),
                durationSeconds = json.getLong("durationSeconds"),
                openCount = json.optInt("openCount", 0)
            )
        }
    }
}

/**
 * Start and end timestamps for the reporting window
 */
data class ReportingPeriodDto(
    val start: String,
    val end: String
) {
    fun toJsonObject(): JSONObject {
        val obj = JSONObject()
        obj.put("start", start)
        obj.put("end", end)
        return obj
    }
}

/**
 * Screen time report payload sent to POST /api/v1/devices/screen-time
 * Strictly enforces zero-fabrication: when permissionGranted is false, totalScreenTimeSeconds is null.
 * Includes mobile open (unlock) count and per-app open counts.
 */
data class ScreenTimeReportRequest(
    val date: String,
    val totalScreenTimeSeconds: Long?,
    val reportingPeriod: ReportingPeriodDto,
    val permissionGranted: Boolean,
    val source: String = if (permissionGranted) "measured" else "unavailable",
    val appUsage: List<AppUsageItemDto> = emptyList(),
    val deviceUnlockCount: Int = 0
) {
    fun toJson(): String {
        val json = JSONObject()
        json.put("date", date)
        if (permissionGranted && totalScreenTimeSeconds != null) {
            json.put("totalScreenTimeSeconds", totalScreenTimeSeconds)
        } else {
            // Strictly null when permission is false (no fabrication)
            json.put("totalScreenTimeSeconds", JSONObject.NULL)
        }
        json.put("deviceUnlockCount", if (permissionGranted) deviceUnlockCount else 0)
        json.put("reportingPeriod", reportingPeriod.toJsonObject())
        json.put("permissionGranted", permissionGranted)
        json.put("source", source)

        val appsArray = JSONArray()
        if (permissionGranted) {
            appUsage.forEach { appsArray.put(it.toJsonObject()) }
        }
        json.put("appUsage", appsArray)

        return json.toString()
    }
}
