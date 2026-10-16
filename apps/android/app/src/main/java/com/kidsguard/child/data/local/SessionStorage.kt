package com.kidsguard.child.data.local

import android.content.Context
import com.kidsguard.child.data.model.DeviceSession

/**
 * Stores non-secret device session metadata in standard private SharedPreferences.
 */
class SessionStorage(private val context: Context) {

    companion object {
        private const val PREFS_NAME = "kidsguard_session_prefs"
        private const val KEY_SESSION_DATA = "session_data"
    }

    private val prefs by lazy {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    fun getSession(): DeviceSession {
        val json = prefs.getString(KEY_SESSION_DATA, null)
        return DeviceSession.fromJson(json)
    }

    fun saveSession(session: DeviceSession) {
        prefs.edit().putString(KEY_SESSION_DATA, session.toJson()).apply()
    }

    fun clearSession() {
        prefs.edit().remove(KEY_SESSION_DATA).apply()
    }
}
