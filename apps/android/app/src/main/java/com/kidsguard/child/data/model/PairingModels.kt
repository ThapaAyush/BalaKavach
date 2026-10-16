package com.kidsguard.child.data.model

import org.json.JSONObject

/**
 * Request payload sent to POST /api/v1/device-pairing/redeem
 */
data class PairingRequest(
    val code: String,
    val name: String,
    val platform: String = "android"
) {
    fun toJson(): String {
        val json = JSONObject()
        json.put("code", code)
        json.put("name", name)
        json.put("platform", platform)
        return json.toString()
    }
}

/**
 * Public device DTO returned from pairing or heartbeat endpoints
 */
data class DeviceDto(
    val id: String,
    val childProfileId: String?,
    val name: String,
    val platform: String,
    val pairingStatus: String,
    val pairedAt: String?,
    val lastSeenAt: String?,
    val enforcementStatus: String = "not_implemented",
    val revokedAt: String? = null
) {
    companion object {
        fun fromJson(json: JSONObject): DeviceDto {
            return DeviceDto(
                id = json.getString("id"),
                childProfileId = json.optString("childProfileId").takeIf { it.isNotBlank() },
                name = json.getString("name"),
                platform = json.optString("platform", "android"),
                pairingStatus = json.optString("pairingStatus", "paired"),
                pairedAt = json.optString("pairedAt").takeIf { it.isNotBlank() },
                lastSeenAt = json.optString("lastSeenAt").takeIf { it.isNotBlank() },
                enforcementStatus = json.optString("enforcementStatus", "not_implemented"),
                revokedAt = json.optString("revokedAt").takeIf { it.isNotBlank() }
            )
        }
    }
}

/**
 * Successful response from POST /api/v1/device-pairing/redeem
 */
data class PairingResponse(
    val device: DeviceDto,
    val deviceCredential: String
) {
    companion object {
        fun fromJson(json: JSONObject): PairingResponse {
            val data = json.getJSONObject("data")
            val deviceObj = data.getJSONObject("device")
            val credential = data.getString("deviceCredential")
            return PairingResponse(
                device = DeviceDto.fromJson(deviceObj),
                deviceCredential = credential
            )
        }
    }
}
