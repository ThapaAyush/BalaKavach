package com.kidsguard.child.data.model

import org.json.JSONObject

/**
 * Successful response from POST /api/v1/devices/heartbeat
 */
data class HeartbeatResponse(
    val device: DeviceDto
) {
    companion object {
        fun fromJson(json: JSONObject): HeartbeatResponse {
            val data = json.getJSONObject("data")
            val deviceObj = data.getJSONObject("device")
            return HeartbeatResponse(
                device = DeviceDto.fromJson(deviceObj)
            )
        }
    }
}
