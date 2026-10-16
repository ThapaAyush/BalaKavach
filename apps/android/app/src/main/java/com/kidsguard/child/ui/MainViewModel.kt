package com.kidsguard.child.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.kidsguard.child.data.local.ServerConfigStorage
import com.kidsguard.child.data.model.ApiResult
import com.kidsguard.child.data.model.DevicePolicyResponse
import com.kidsguard.child.data.model.DeviceSession
import com.kidsguard.child.data.model.ScreenTimeReportRequest
import com.kidsguard.child.data.repository.DeviceRepository
import com.kidsguard.child.data.repository.PolicyRepository
import com.kidsguard.child.service.usage.UsageStatsReader
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * ViewModel managing UI state for the KidsGuard child companion app.
 * Exposes strictly read-only status and sync operations; no unpairing or policy editing.
 */
class MainViewModel(
    private val deviceRepository: DeviceRepository,
    private val policyRepository: PolicyRepository,
    private val usageStatsReader: UsageStatsReader,
    private val serverConfigStorage: ServerConfigStorage
) : ViewModel() {

    val deviceSession: StateFlow<DeviceSession> = deviceRepository.deviceSession
    val cachedPolicy: StateFlow<DevicePolicyResponse?> = policyRepository.cachedPolicy

    private val _todayUsage = MutableStateFlow<ScreenTimeReportRequest?>(null)
    val todayUsage: StateFlow<ScreenTimeReportRequest?> = _todayUsage.asStateFlow()

    private val _hasUsagePermission = MutableStateFlow(usageStatsReader.hasPermission())
    val hasUsagePermission: StateFlow<Boolean> = _hasUsagePermission.asStateFlow()

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

    init {
        refreshUsageData()
    }

    fun refreshUsageData() {
        val permission = usageStatsReader.hasPermission()
        _hasUsagePermission.value = permission
        _todayUsage.value = usageStatsReader.measureTodayUsage()
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
        _apiUrlSavedMessage.value = "Reset to default emulator URL ($defaultUrl)"
    }

    class Factory(
        private val deviceRepository: DeviceRepository,
        private val policyRepository: PolicyRepository,
        private val usageStatsReader: UsageStatsReader,
        private val serverConfigStorage: ServerConfigStorage
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return MainViewModel(deviceRepository, policyRepository, usageStatsReader, serverConfigStorage) as T
        }
    }
}
