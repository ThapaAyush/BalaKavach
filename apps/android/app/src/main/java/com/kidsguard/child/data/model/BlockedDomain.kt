package com.kidsguard.child.data.model

import org.json.JSONArray
import org.json.JSONObject

/**
 * Represents a locally configured blocked domain.
 */
data class BlockedDomain(
    val domain: String,
    val addedAt: Long = System.currentTimeMillis()
) {
    fun toJson(): JSONObject {
        val json = JSONObject()
        json.put("domain", domain)
        json.put("addedAt", addedAt)
        return json
    }

    companion object {
        fun fromJson(json: JSONObject): BlockedDomain {
            return BlockedDomain(
                domain = json.getString("domain"),
                addedAt = json.optLong("addedAt", System.currentTimeMillis())
            )
        }

        fun listToJsonString(list: List<BlockedDomain>): String {
            val array = JSONArray()
            for (item in list) {
                array.put(item.toJson())
            }
            return array.toString()
        }

        fun listFromJsonString(jsonString: String?): List<BlockedDomain> {
            if (jsonString.isNullOrBlank()) return emptyList()
            return try {
                val array = JSONArray(jsonString)
                val result = mutableListOf<BlockedDomain>()
                for (i in 0 until array.length()) {
                    val obj = array.getJSONObject(i)
                    result.add(fromJson(obj))
                }
                result
            } catch (_: Exception) {
                emptyList()
            }
        }
    }
}
