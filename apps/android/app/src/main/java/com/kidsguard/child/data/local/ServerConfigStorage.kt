package com.kidsguard.child.data.local

import android.content.Context
import android.content.pm.ApplicationInfo
import com.kidsguard.child.BuildConfig
import java.net.URI
import java.util.Locale

/**
 * Stores and validates the backend API base URL configuration.
 *
 * Enforces build-variant separation:
 * - Debug builds default to the local loopback (http://10.0.2.2:5000/api/v1) and permit developer overrides.
 * - Release builds strictly require a valid remote HTTPS URL and reject localhost or debug-only overrides.
 */
class ServerConfigStorage(
    private val context: Context,
    private val defaultBaseUrl: String = BuildConfig.DEFAULT_API_BASE_URL,
    private val isDebuggableProvider: () -> Boolean = {
        (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    }
) {

    companion object {
        private const val PREFS_NAME = "kidsguard_config"
        private const val KEY_API_BASE_URL = "api_base_url"

        /**
         * Placeholder value indicating an unconfigured production URL.
         */
        const val UNCONFIGURED_PLACEHOLDER = "UNCONFIGURED_PRODUCTION_URL"

        /**
         * Standard production cloud backend URL hosted on Render.
         */
        const val DEFAULT_CLOUD_API_BASE_URL = "https://balakavach-be.onrender.com/api/v1"

        /**
         * Standard emulator loopback URL for local backend development.
         */
        const val DEFAULT_EMULATOR_API_BASE_URL = "http://10.0.2.2:5000/api/v1"

        /**
         * Default API base URL for mobile devices (points to Render cloud).
         */
        const val DEFAULT_DEBUG_API_BASE_URL = DEFAULT_CLOUD_API_BASE_URL

        /**
         * Backwards-compatible alias for default URL.
         */
        const val DEFAULT_API_BASE_URL = DEFAULT_CLOUD_API_BASE_URL

        /**
         * Normalizes and validates an API base URL.
         * Enforces HTTPS for all remote hosts; permits HTTP only for local loopback / emulator.
         * Rejects unconfigured placeholders and credentials.
         */
        @Throws(IllegalArgumentException::class)
        fun normalizeApiBaseUrl(rawUrl: String?): String {
            if (rawUrl.isNullOrBlank()) {
                throw IllegalArgumentException("API base URL must be a non-empty string.")
            }

            val trimmed = rawUrl.trim()
            if (trimmed == UNCONFIGURED_PLACEHOLDER || trimmed.contains("UNCONFIGURED")) {
                throw IllegalArgumentException("API base URL is unconfigured. A valid URL is required.")
            }

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
            val rawPath = uri.path?.trimEnd('/') ?: ""
            val pathPart = if (rawPath.isEmpty() || rawPath == "/") "/api/v1" else rawPath
            return "$scheme://$host$portPart$pathPart"
        }

        /**
         * Validates that the URL is suitable for production release builds:
         * - Must be configured (not placeholder).
         * - Must use HTTPS.
         * - Must NOT be localhost or loopback.
         */
        @Throws(IllegalArgumentException::class)
        fun validateReleaseApiBaseUrl(rawUrl: String?): String {
            if (rawUrl.isNullOrBlank() || rawUrl == UNCONFIGURED_PLACEHOLDER || rawUrl.contains("UNCONFIGURED")) {
                throw IllegalArgumentException("Release API base URL is unconfigured. A valid HTTPS production URL is required.")
            }
            val normalized = normalizeApiBaseUrl(rawUrl)
            val uri = URI(normalized)
            val host = uri.host?.lowercase(Locale.ROOT) ?: ""
            val isLocalhost = host == "localhost" || host == "127.0.0.1" || host == "10.0.2.2" || host == "[::1]"
            if (uri.scheme != "https" || isLocalhost) {
                throw IllegalArgumentException("Release API base URL must use HTTPS and cannot use localhost ($normalized).")
            }
            return normalized
        }
    }

    private val prefs by lazy {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getApiBaseUrl(): String {
        val isDebuggable = isDebuggableProvider()
        if (!isDebuggable) {
            // Release builds strictly require and validate the production base URL;
            // debug overrides are ignored to prevent release builds from connecting to localhost.
            return validateReleaseApiBaseUrl(defaultBaseUrl)
        }
        val stored = prefs.getString(KEY_API_BASE_URL, null)
        // Auto-migration: If stored preference points to obsolete 10.0.2.2 emulator loopback
        // (which causes timeouts on physical phones) while default is cloud, clean it up.
        if (stored != null && stored.contains("10.0.2.2") && !defaultBaseUrl.contains("10.0.2.2")) {
            prefs.edit().remove(KEY_API_BASE_URL).apply()
            return normalizeApiBaseUrl(defaultBaseUrl)
        }
        return try {
            normalizeApiBaseUrl(stored ?: defaultBaseUrl)
        } catch (_: Exception) {
            normalizeApiBaseUrl(defaultBaseUrl)
        }
    }

    @Throws(IllegalArgumentException::class, IllegalStateException::class)
    fun setApiBaseUrl(rawUrl: String): String {
        val isDebuggable = isDebuggableProvider()
        if (!isDebuggable) {
            throw IllegalStateException("API base URL cannot be modified in release builds.")
        }
        val normalized = normalizeApiBaseUrl(rawUrl)
        prefs.edit().putString(KEY_API_BASE_URL, normalized).apply()
        return normalized
    }

    @Throws(IllegalStateException::class)
    fun resetToDefault(): String {
        val isDebuggable = isDebuggableProvider()
        if (!isDebuggable) {
            throw IllegalStateException("API base URL cannot be modified in release builds.")
        }
        prefs.edit().remove(KEY_API_BASE_URL).apply()
        return defaultBaseUrl
    }
}
