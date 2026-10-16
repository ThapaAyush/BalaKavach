package com.kidsguard.child.data.local

import android.content.Context
import java.net.URI
import java.util.Locale

/**
 * Stores and validates the backend API base URL configuration.
 */
class ServerConfigStorage(private val context: Context) {

    companion object {
        private const val PREFS_NAME = "kidsguard_config"
        private const val KEY_API_BASE_URL = "api_base_url"

        /**
         * Default URL points to host machine loopback on Android emulator.
         */
        const val DEFAULT_API_BASE_URL = "http://10.0.2.2:5000/api/v1"

        /**
         * Normalizes and validates the API base URL.
         * Enforces HTTPS for all remote hosts; permits HTTP only for local loopback / emulator.
         */
        @Throws(IllegalArgumentException::class)
        fun normalizeApiBaseUrl(rawUrl: String?): String {
            if (rawUrl.isNullOrBlank()) {
                throw IllegalArgumentException("API base URL must be a non-empty string.")
            }

            val trimmed = rawUrl.trim()
            val uri: URI = try {
                URI(trimmed)
            } catch (_: Exception) {
                throw IllegalArgumentException("Invalid API base URL.")
            }

            if (uri.userInfo != null) {
                throw IllegalArgumentException("API base URL must not contain credentials.")
            }

            val scheme = uri.scheme?.lowercase(Locale.ROOT)
            val host = uri.host?.lowercase(Locale.ROOT) ?: throw IllegalArgumentException("Invalid API base URL host.")

            val isLocalhost = host == "localhost" || host == "127.0.0.1" || host == "10.0.2.2" || host == "[::1]"

            if (scheme == "http") {
                if (!isLocalhost) {
                    throw IllegalArgumentException("Insecure HTTP is not allowed for non-local host '$host'. HTTPS is required.")
                }
            } else if (scheme != "https") {
                throw IllegalArgumentException("Unsupported protocol '$scheme'. Only HTTPS (or local HTTP) is permitted.")
            }

            val portPart = if (uri.port != -1) ":${uri.port}" else ""
            val pathPart = uri.path?.trimEnd('/') ?: ""
            return "$scheme://$host$portPart$pathPart"
        }
    }

    private val prefs by lazy {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getApiBaseUrl(): String {
        val stored = prefs.getString(KEY_API_BASE_URL, null)
        return try {
            normalizeApiBaseUrl(stored ?: DEFAULT_API_BASE_URL)
        } catch (_: Exception) {
            DEFAULT_API_BASE_URL
        }
    }

    @Throws(IllegalArgumentException::class)
    fun setApiBaseUrl(rawUrl: String): String {
        val normalized = normalizeApiBaseUrl(rawUrl)
        prefs.edit().putString(KEY_API_BASE_URL, normalized).apply()
        return normalized
    }

    fun resetToDefault(): String {
        prefs.edit().remove(KEY_API_BASE_URL).apply()
        return DEFAULT_API_BASE_URL
    }
}
