package com.kidsguard.child.data.model

import org.json.JSONArray
import org.json.JSONObject

/**
 * Public policy structure received from GET /api/v1/devices/policy
 */
data class DevicePolicyResponse(
    val policyVersion: Int,
    val dailyLimitMinutes: Int?,
    val quietHoursEnabled: Boolean,
    val quietHoursStart: String?,
    val quietHoursEnd: String?,
    val quietHoursDays: List<String>,
    val webRestrictionsEnabled: Boolean,
    val blockedDomains: List<String>
) {
    companion object {
        fun defaultPolicy(): DevicePolicyResponse {
            return DevicePolicyResponse(
                policyVersion = 1,
                dailyLimitMinutes = null,
                quietHoursEnabled = false,
                quietHoursStart = "21:00",
                quietHoursEnd = "07:00",
                quietHoursDays = listOf("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"),
                webRestrictionsEnabled = true,
                blockedDomains = emptyList()
            )
        }

        fun fromJson(json: JSONObject): DevicePolicyResponse {
            val data = if (json.has("data")) json.getJSONObject("data") else json
            val policyVersion = data.optInt("policyVersion", 1)
            val policyObj = data.optJSONObject("policy") ?: JSONObject()

            // Screen time
            val screenTimeObj = policyObj.optJSONObject("screenTime")
            val dailyLimitMinutes = if (screenTimeObj != null && screenTimeObj.has("dailyLimitMinutes") && !screenTimeObj.isNull("dailyLimitMinutes")) {
                screenTimeObj.getInt("dailyLimitMinutes")
            } else {
                null
            }

            // Quiet hours
            val quietHoursObj = screenTimeObj?.optJSONObject("quietHours")
            val quietHoursEnabled = quietHoursObj?.optBoolean("enabled", false) ?: false
            val quietHoursStart = quietHoursObj?.optString("start")?.takeIf { it.isNotBlank() } ?: "21:00"
            val quietHoursEnd = quietHoursObj?.optString("end")?.takeIf { it.isNotBlank() } ?: "07:00"
            val quietHoursDays = mutableListOf<String>()
            val daysArray = quietHoursObj?.optJSONArray("days")
            if (daysArray != null) {
                for (i in 0 until daysArray.length()) {
                    quietHoursDays.add(daysArray.getString(i))
                }
            } else {
                quietHoursDays.addAll(listOf("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"))
            }

            // Web restrictions
            val webRestrictionsObj = policyObj.optJSONObject("webRestrictions")
            val webRestrictionsEnabled = webRestrictionsObj?.optBoolean("enabled", true) ?: true
            val blockedDomains = mutableListOf<String>()
            val domainsArray = webRestrictionsObj?.optJSONArray("blockedDomains")
            if (domainsArray != null) {
                for (i in 0 until domainsArray.length()) {
                    blockedDomains.add(domainsArray.getString(i))
                }
            }

            return DevicePolicyResponse(
                policyVersion = policyVersion,
                dailyLimitMinutes = dailyLimitMinutes,
                quietHoursEnabled = quietHoursEnabled,
                quietHoursStart = quietHoursStart,
                quietHoursEnd = quietHoursEnd,
                quietHoursDays = quietHoursDays,
                webRestrictionsEnabled = webRestrictionsEnabled,
                blockedDomains = blockedDomains
            )
        }
    }

    fun toJson(): String {
        val root = JSONObject()
        val data = JSONObject()
        data.put("policyVersion", policyVersion)

        val policyObj = JSONObject()
        val screenTimeObj = JSONObject()
        if (dailyLimitMinutes != null) {
            screenTimeObj.put("dailyLimitMinutes", dailyLimitMinutes)
        } else {
            screenTimeObj.put("dailyLimitMinutes", JSONObject.NULL)
        }

        val quietHoursObj = JSONObject()
        quietHoursObj.put("enabled", quietHoursEnabled)
        quietHoursObj.put("start", quietHoursStart)
        quietHoursObj.put("end", quietHoursEnd)
        val daysArray = JSONArray()
        quietHoursDays.forEach { daysArray.put(it) }
        quietHoursObj.put("days", daysArray)
        screenTimeObj.put("quietHours", quietHoursObj)
        policyObj.put("screenTime", screenTimeObj)

        val webObj = JSONObject()
        webObj.put("enabled", webRestrictionsEnabled)
        val domainsArray = JSONArray()
        blockedDomains.forEach { domainsArray.put(it) }
        webObj.put("blockedDomains", domainsArray)
        policyObj.put("webRestrictions", webObj)

        data.put("policy", policyObj)
        root.put("data", data)
        return root.toString()
    }
}

/**
 * Acknowledgment payload sent to POST /api/v1/devices/policy/ack
 */
data class PolicyAckRequest(
    val acknowledgedVersion: Int
) {
    fun toJson(): String {
        val json = JSONObject()
        json.put("acknowledgedVersion", acknowledgedVersion)
        return json.toString()
    }
}

/**
 * Successful response from POST /api/v1/devices/policy/ack
 */
data class PolicyAckResponse(
    val acknowledgedVersion: Int,
    val syncedAt: String?
) {
    companion object {
        fun fromJson(json: JSONObject): PolicyAckResponse {
            val data = if (json.has("data")) json.getJSONObject("data") else json
            return PolicyAckResponse(
                acknowledgedVersion = data.getInt("acknowledgedVersion"),
                syncedAt = data.optString("syncedAt").takeIf { it.isNotBlank() }
            )
        }
    }
}
