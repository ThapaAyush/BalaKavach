package com.kidsguard.child.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.kidsguard.child.data.local.ServerConfigStorage
import com.kidsguard.child.data.model.ApiResult
import com.kidsguard.child.data.model.AppUpdateInfo
import com.kidsguard.child.data.model.DevicePolicyResponse
import com.kidsguard.child.data.model.DeviceSession
import com.kidsguard.child.data.model.ScreenTimeReportRequest
import com.kidsguard.child.data.repository.DeviceRepository
import com.kidsguard.child.data.repository.PolicyRepository
import com.kidsguard.child.service.update.AppUpdateManager
import com.kidsguard.child.service.usage.UsageStatsReader
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * High-level connection states mapped from device session and network sync states:
 * - UNPAIRED: Device is not yet linked to a parent account.
 * - CONNECTING: Active pairing or background/manual synchronization in progress.
 * - PAIRED: Active paired session with verified communication.
 * - OFFLINE: Backend unreachable; last-known policies remain active.
 * - NEEDS_ATTENTION: Session expired or revoked by parent; requires re-pairing.
 */
enum class ConnectionState {
    UNPAIRED,
    CONNECTING,
    PAIRED,
    OFFLINE,
    NEEDS_ATTENTION
}

/**
 * ViewModel managing UI state for the KidsGuard child companion app.
 * Exposes strictly read-only status and sync operations; no unpairing or policy editing.
 */
class MainViewModel(
    private val deviceRepository: DeviceRepository,
    private val policyRepository: PolicyRepository,
    private val usageStatsReader: UsageStatsReader,
    private val serverConfigStorage: ServerConfigStorage,
    val appUpdateManager: AppUpdateManager? = null
) : ViewModel() {

    val deviceSession: StateFlow<DeviceSession> = deviceRepository.deviceSession
    val cachedPolicy: StateFlow<DevicePolicyResponse?> = policyRepository.cachedPolicy

    private val _appUpdateInfo = MutableStateFlow<AppUpdateInfo?>(null)
    val appUpdateInfo: StateFlow<AppUpdateInfo?> = _appUpdateInfo.asStateFlow()

    private val _updateCheckLoading = MutableStateFlow(false)
    val updateCheckLoading: StateFlow<Boolean> = _updateCheckLoading.asStateFlow()

    private val _updateCheckStatusMessage = MutableStateFlow<String?>(null)
    val updateCheckStatusMessage: StateFlow<String?> = _updateCheckStatusMessage.asStateFlow()

    private val _todayUsage = MutableStateFlow<ScreenTimeReportRequest?>(null)
    val todayUsage: StateFlow<ScreenTimeReportRequest?> = _todayUsage.asStateFlow()

    private val _hasUsagePermission = MutableStateFlow(usageStatsReader.hasPermission())
    val hasUsagePermission: StateFlow<Boolean> = _hasUsagePermission.asStateFlow()

    private val _lastUsageRefreshTime = MutableStateFlow<Long?>(null)
    val lastUsageRefreshTime: StateFlow<Long?> = _lastUsageRefreshTime.asStateFlow()

    private val _lastSuccessfulMeasurementTime = MutableStateFlow<Long?>(null)
    val lastSuccessfulMeasurementTime: StateFlow<Long?> = _lastSuccessfulMeasurementTime.asStateFlow()

    private val _pairingLoading = MutableStateFlow(false)
    val pairingLoading: StateFlow<Boolean> = _pairingLoading.asStateFlow()

    private val _pairingError = MutableStateFlow<String?>(null)
    val pairingError: StateFlow<String?> = _pairingError.asStateFlow()

    private val _syncLoading = MutableStateFlow(false)
    val syncLoading: StateFlow<Boolean> = _syncLoading.asStateFlow()

    private val _syncMessage = MutableStateFlow<String?>(null)
    val syncMessage: StateFlow<String?> = _syncMessage.asStateFlow()

    private val _apiUrl = MutableStateFlow(serverConfigStorage.getApiBaseUrl())
    val apiUrl: StateFlow<String> = _apiUrl.asStateFlow()

    private val _apiUrlError = MutableStateFlow<String?>(null)
    val apiUrlError: StateFlow<String?> = _apiUrlError.asStateFlow()

    private val _apiUrlSavedMessage = MutableStateFlow<String?>(null)
    val apiUrlSavedMessage: StateFlow<String?> = _apiUrlSavedMessage.asStateFlow()

    /**
     * Accurately maps existing session and network states to user-facing ConnectionState.
     */
    val connectionState: StateFlow<ConnectionState> = combine(
        deviceSession,
        pairingLoading,
        syncLoading
    ) { session, pairing, sync ->
        computeConnectionState(session, pairing, sync)
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.Eagerly,
        initialValue = computeConnectionState(
            deviceSession.value,
            pairingLoading.value,
            syncLoading.value
        )
    )

    init {
        refreshUsageData()
    }

    fun refreshUsageData() {
        val permission = usageStatsReader.hasPermission()
        _hasUsagePermission.value = permission
        val usage = usageStatsReader.measureTodayUsage()
        _todayUsage.value = usage
        val now = System.currentTimeMillis()
        _lastUsageRefreshTime.value = now
        val isMeasured = usage.permissionGranted && usage.totalScreenTimeSeconds != null
        if (isMeasured) {
            _lastSuccessfulMeasurementTime.value = now
        } else {
            _lastSuccessfulMeasurementTime.value = null
        }
    }

    fun clearPairingError() {
        _pairingError.value = null
    }

    fun clearApiUrlError() {
        _apiUrlError.value = null
    }

    fun clearApiUrlSavedMessage() {
        _apiUrlSavedMessage.value = null
    }

    fun pairDevice(code: String, name: String) {
        if (_pairingLoading.value) return
        _pairingLoading.value = true
        _pairingError.value = null

        viewModelScope.launch {
            try {
                when (val result = deviceRepository.redeemPairingCode(code, name)) {
                    is ApiResult.Success -> {
                        _pairingError.value = null
                        // Immediately perform initial synchronization
                        syncNow()
                    }
                    is ApiResult.Error -> {
                        _pairingError.value = result.message
                    }
                }
            } finally {
                _pairingLoading.value = false
            }
        }
    }

    fun syncNow() {
        if (_syncLoading.value) return
        _syncLoading.value = true
        _syncMessage.value = null

        viewModelScope.launch {
            try {
                refreshUsageData()
                when (val result = deviceRepository.syncAll(policyRepository, usageStatsReader)) {
                    is ApiResult.Success -> {
                        _syncMessage.value = null
                        refreshUsageData()
                    }
                    is ApiResult.Error -> {
                        _syncMessage.value = result.message
                    }
                }
            } finally {
                _syncLoading.value = false
            }
        }
    }

    private var isAutoSyncing = false

    /**
     * Seamlessly and automatically synchronizes parental policy changes without user intervention.
     * Operates silently without setting syncLoading, preserving continuous Paired & Active status.
     */
    fun autoSync() {
        val session = deviceSession.value
        if (!session.isPaired || isAutoSyncing || _syncLoading.value) return
        isAutoSyncing = true

        viewModelScope.launch {
            try {
                deviceRepository.syncPolicyOnly(policyRepository)
            } catch (_: Exception) {
                // Background auto-sync handles transient network failures silently
            } finally {
                isAutoSyncing = false
            }
        }
    }

    fun saveApiUrl(url: String): Boolean {
        _apiUrlError.value = null
        _apiUrlSavedMessage.value = null
        return try {
            val normalized = serverConfigStorage.setApiBaseUrl(url)
            _apiUrl.value = normalized
            _apiUrlSavedMessage.value = "API URL updated successfully."
            true
        } catch (e: IllegalArgumentException) {
            _apiUrlError.value = e.message ?: "Invalid API URL."
            false
        }
    }

    fun resetApiUrl() {
        val defaultUrl = serverConfigStorage.resetToDefault()
        _apiUrl.value = defaultUrl
        _apiUrlError.value = null
        _apiUrlSavedMessage.value = "Reset to default URL ($defaultUrl)"
    }

    companion object {
        fun computeConnectionState(
            session: DeviceSession,
            isPairingLoading: Boolean,
            isSyncLoading: Boolean
        ): ConnectionState {
            if (isPairingLoading) {
                return ConnectionState.CONNECTING
            }
            if (!session.isPaired) {
                return ConnectionState.UNPAIRED
            }
            if (session.pairingStatus == DeviceSession.STATUS_INVALID_SESSION ||
                session.lastHeartbeatStatus == DeviceSession.STATUS_INVALID_SESSION
            ) {
                return ConnectionState.NEEDS_ATTENTION
            }
            if (isSyncLoading) {
                return ConnectionState.CONNECTING
            }
            if (session.lastHeartbeatStatus == "offline") {
                return ConnectionState.OFFLINE
            }
            if (session.lastHeartbeatStatus == "error") {
                return ConnectionState.OFFLINE
            }
            return ConnectionState.PAIRED
        }
    }

    fun checkForAppUpdate(currentVersionCode: Int, currentVersionName: String, isManual: Boolean = false) {
        val manager = appUpdateManager ?: return
        viewModelScope.launch {
            if (isManual) {
                _updateCheckLoading.value = true
                _updateCheckStatusMessage.value = null
            }
            try {
                when (val result = manager.checkForUpdates(currentVersionCode, currentVersionName)) {
                    is ApiResult.Success -> {
                        val info = result.data
                        if (info.updateAvailable) {
                            _appUpdateInfo.value = info
                            if (isManual) {
                                _updateCheckStatusMessage.value = "New update available: v${info.latestVersionName}"
                            }
                        } else {
                            if (isManual) {
                                _updateCheckStatusMessage.value = "You are on the latest version!"
                            }
                        }
                    }
                    is ApiResult.Error -> {
                        if (isManual) {
                            _updateCheckStatusMessage.value = "Check failed: ${result.message}"
                        }
                    }
                }
            } catch (_: Exception) {
                if (isManual) {
                    _updateCheckStatusMessage.value = "Check failed. Try again later."
                }
            } finally {
                if (isManual) {
                    _updateCheckLoading.value = false
                }
            }
        }
    }

    fun dismissUpdate() {
        _appUpdateInfo.value = null
    }

    fun clearUpdateStatusMessage() {
        _updateCheckStatusMessage.value = null
    }

    class Factory(
        private val deviceRepository: DeviceRepository,
        private val policyRepository: PolicyRepository,
        private val usageStatsReader: UsageStatsReader,
        private val serverConfigStorage: ServerConfigStorage,
        private val appUpdateManager: AppUpdateManager? = null
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return MainViewModel(deviceRepository, policyRepository, usageStatsReader, serverConfigStorage, appUpdateManager) as T
        }
    }
}
