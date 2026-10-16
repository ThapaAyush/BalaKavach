package com.kidsguard.child

import android.app.usage.UsageEvents
import com.kidsguard.child.data.model.AppUsageItemDto
import com.kidsguard.child.data.model.ReportingPeriodDto
import com.kidsguard.child.data.model.ScreenTimeReportRequest
import com.kidsguard.child.service.usage.UsageEventRecord
import com.kidsguard.child.service.usage.UsageStatsHelper
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UsageStatsReaderTest {

    @Test
    fun `aggregateEvents avoids double-counting by tracking single foreground app`() {
        val startMs = 1000000L
        val endMs = 2000000L // 1000 seconds total window

        val events = listOf(
            // App A opens at 1000s, runs for 300s
            UsageEventRecord("com.app.a", 1000000L, UsageEvents.Event.ACTIVITY_RESUMED),
            UsageEventRecord("com.app.a", 1300000L, UsageEvents.Event.ACTIVITY_PAUSED),

            // Gap of 100s with screen off / home screen

            // App B opens at 1400s
            UsageEventRecord("com.app.b", 1400000L, UsageEvents.Event.ACTIVITY_RESUMED),
            // User switches directly from App B to App A at 1700s (no pause event for B, A resumes)
            UsageEventRecord("com.app.a", 1700000L, UsageEvents.Event.ACTIVITY_RESUMED),
            // App A stops at 1900s
            UsageEventRecord("com.app.a", 1900000L, UsageEvents.Event.ACTIVITY_STOPPED)
        )

        val aggregated = UsageStatsHelper.aggregateEvents(events, startMs, endMs)

        // com.app.a: 300s (1000s..1300s) + 200s (1700s..1900s) = 500s
        // com.app.b: 300s (1400s..1700s) = 300s
        assertEquals(500L, aggregated["com.app.a"])
        assertEquals(300L, aggregated["com.app.b"])

        // Total non-overlapping active time = 800s (not inflated)
        val totalSec = aggregated.values.sum()
        assertEquals(800L, totalSec)
    }

    @Test
    fun `aggregateEvents handles ongoing foreground app at end of reporting window`() {
        val startMs = 0L
        val endMs = 600000L // 600 seconds (10 minutes)

        val events = listOf(
            UsageEventRecord("com.youtube", 100000L, UsageEvents.Event.ACTIVITY_RESUMED)
            // Still active at endMs
        )

        val aggregated = UsageStatsHelper.aggregateEvents(events, startMs, endMs)

        // Active from 100s to 600s = 500s
        assertEquals(500L, aggregated["com.youtube"])
    }

    @Test
    fun `zero fabrication rule enforces null duration when permission is denied`() {
        val request = ScreenTimeReportRequest(
            date = "2026-10-15",
            totalScreenTimeSeconds = null,
            reportingPeriod = ReportingPeriodDto("2026-10-15T00:00:00Z", "2026-10-15T12:00:00Z"),
            permissionGranted = false,
            source = "unavailable",
            appUsage = emptyList()
        )

        val jsonString = request.toJson()
        val json = JSONObject(jsonString)

        assertFalse(json.getBoolean("permissionGranted"))
        assertEquals("unavailable", json.getString("source"))
        assertTrue(json.isNull("totalScreenTimeSeconds"))
        assertEquals(0, json.getJSONArray("appUsage").length())
    }

    @Test
    fun `serializes measured usage correctly when permission is granted`() {
        val request = ScreenTimeReportRequest(
            date = "2026-10-15",
            totalScreenTimeSeconds = 3600L,
            reportingPeriod = ReportingPeriodDto("2026-10-15T00:00:00Z", "2026-10-15T12:00:00Z"),
            permissionGranted = true,
            source = "measured",
            appUsage = listOf(
                AppUsageItemDto("com.browser", "Chrome", 2400L),
                AppUsageItemDto("com.game", "Puzzle", 1200L)
            )
        )

        val jsonString = request.toJson()
        val json = JSONObject(jsonString)

        assertTrue(json.getBoolean("permissionGranted"))
        assertEquals(3600L, json.getLong("totalScreenTimeSeconds"))
        assertEquals(2, json.getJSONArray("appUsage").length())

        val firstApp = json.getJSONArray("appUsage").getJSONObject(0)
        assertEquals("com.browser", firstApp.getString("packageName"))
        assertEquals(2400L, firstApp.getLong("durationSeconds"))
    }
}
