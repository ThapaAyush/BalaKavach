package com.kidsguard.child.data.model

import org.json.JSONObject

/**
 * Sanitized, immutable state of the device session on Android.
 * Never holds or exposes raw secret credentials.
 */
data class DeviceSession(
    val isPaired: Boolean = false,
    val pairingStatus: String = STATUS_UNPAIRED,
    val deviceId: String? = null,
    val deviceName: String? = null,
    val childProfileId: String? = null,
    val platform: String? = null,
    val pairedAt: String? = null,
    val lastSeenAt: String? = null,
    val lastHeartbeatAt: String? = null,
    val lastHeartbeatStatus: String? = null,
    val acknowledgedPolicyVersion: Int = 0,
    val lastPolicySyncAt: String? = null,
    val lastScreenTimeReportAt: String? = null,
    val dailyLimitMinutes: Int? = null,
    val quietHoursEnabled: Boolean = false,
    val quietHoursRange: String? = null
) {
    companion object {
        const val STATUS_UNPAIRED = "unpaired"
        const val STATUS_PAIRED = "paired"
        const val STATUS_INVALID_SESSION = "invalid_session"

        fun unpaired(): DeviceSession = DeviceSession()

        fun fromJson(jsonString: String?): DeviceSession {
            if (jsonString.isNullOrBlank()) return unpaired()
            return try {
                val json = JSONObject(jsonString)
                val status = json.optString("pairingStatus", STATUS_UNPAIRED)
                val dailyLimit = if (json.has("dailyLimitMinutes") && !json.isNull("dailyLimitMinutes")) {
                    json.getInt("dailyLimitMinutes")
                } else null

                DeviceSession(
                    isPaired = status == STATUS_PAIRED,
                    pairingStatus = status,
                    deviceId = json.optString("deviceId").takeIf { it.isNotBlank() },
                    deviceName = json.optString("deviceName").takeIf { it.isNotBlank() },
                    childProfileId = json.optString("childProfileId").takeIf { it.isNotBlank() },
                    platform = json.optString("platform").takeIf { it.isNotBlank() },
                    pairedAt = json.optString("pairedAt").takeIf { it.isNotBlank() },
                    lastSeenAt = json.optString("lastSeenAt").takeIf { it.isNotBlank() },
                    lastHeartbeatAt = json.optString("lastHeartbeatAt").takeIf { it.isNotBlank() },
                    lastHeartbeatStatus = json.optString("lastHeartbeatStatus").takeIf { it.isNotBlank() },
                    acknowledgedPolicyVersion = json.optInt("acknowledgedPolicyVersion", 0),
                    lastPolicySyncAt = json.optString("lastPolicySyncAt").takeIf { it.isNotBlank() },
                    lastScreenTimeReportAt = json.optString("lastScreenTimeReportAt").takeIf { it.isNotBlank() },
                    dailyLimitMinutes = dailyLimit,
                    quietHoursEnabled = json.optBoolean("quietHoursEnabled", false),
                    quietHoursRange = json.optString("quietHoursRange").takeIf { it.isNotBlank() }
                )
            } catch (_: Exception) {
                unpaired()
            }
        }
    }

    fun toJson(): String {
        val json = JSONObject()
        json.put("isPaired", isPaired)
        json.put("pairingStatus", pairingStatus)
        deviceId?.let { json.put("deviceId", it) }
        deviceName?.let { json.put("deviceName", it) }
        childProfileId?.let { json.put("childProfileId", it) }
        platform?.let { json.put("platform", it) }
        pairedAt?.let { json.put("pairedAt", it) }
        lastSeenAt?.let { json.put("lastSeenAt", it) }
        lastHeartbeatAt?.let { json.put("lastHeartbeatAt", it) }
        lastHeartbeatStatus?.let { json.put("lastHeartbeatStatus", it) }
        json.put("acknowledgedPolicyVersion", acknowledgedPolicyVersion)
        lastPolicySyncAt?.let { json.put("lastPolicySyncAt", it) }
        lastScreenTimeReportAt?.let { json.put("lastScreenTimeReportAt", it) }
        if (dailyLimitMinutes != null) {
            json.put("dailyLimitMinutes", dailyLimitMinutes)
        } else {
            json.put("dailyLimitMinutes", JSONObject.NULL)
        }
        json.put("quietHoursEnabled", quietHoursEnabled)
        quietHoursRange?.let { json.put("quietHoursRange", it) }
        return json.toString()
    }
}
