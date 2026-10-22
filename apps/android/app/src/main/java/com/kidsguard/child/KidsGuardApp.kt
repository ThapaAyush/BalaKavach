package com.kidsguard.child

import android.app.Application
import androidx.appcompat.app.AppCompatDelegate
import com.kidsguard.child.data.local.FilePolicyStorage
import com.kidsguard.child.data.local.KeystoreCredentialStorage
import com.kidsguard.child.data.local.LocalPolicyStorage
import com.kidsguard.child.data.local.SecureCredentialStorage
import com.kidsguard.child.data.local.ServerConfigStorage
import com.kidsguard.child.data.local.SessionStorage
import com.kidsguard.child.data.model.DeviceSession
import com.kidsguard.child.data.remote.KidsGuardApiClient
import com.kidsguard.child.data.repository.DeviceRepository
import com.kidsguard.child.data.repository.PolicyRepository
import com.kidsguard.child.service.usage.AndroidUsageStatsReader
import com.kidsguard.child.service.usage.UsageStatsReader
import com.kidsguard.child.service.work.HeartbeatScheduler

/**
 * Main application class providing centralized dependency management.
 */
class KidsGuardApp : Application() {

    lateinit var secureCredentialStorage: SecureCredentialStorage
        private set
    lateinit var sessionStorage: SessionStorage
        private set
    lateinit var serverConfigStorage: ServerConfigStorage
        private set
    lateinit var localPolicyStorage: LocalPolicyStorage
        private set
    lateinit var apiClient: KidsGuardApiClient
        private set
    lateinit var heartbeatScheduler: HeartbeatScheduler
        private set
    lateinit var usageStatsReader: UsageStatsReader
        private set
    lateinit var deviceRepository: DeviceRepository
        private set
    lateinit var policyRepository: PolicyRepository
        private set

    override fun onCreate() {
        super.onCreate()

        // Enforce light theme consistency across all Android devices and dark-mode settings
        AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)

        secureCredentialStorage = KeystoreCredentialStorage(this)
        sessionStorage = SessionStorage(this)
        serverConfigStorage = ServerConfigStorage(this)
        localPolicyStorage = FilePolicyStorage(this)
        apiClient = KidsGuardApiClient()
        heartbeatScheduler = HeartbeatScheduler(this)
        usageStatsReader = AndroidUsageStatsReader(this)

        deviceRepository = DeviceRepository(
            apiClient = apiClient,
            secureStorage = secureCredentialStorage,
            sessionStorage = sessionStorage,
            serverConfigStorage = serverConfigStorage,
            heartbeatScheduler = heartbeatScheduler
        )

        policyRepository = PolicyRepository(
            localPolicyStorage = localPolicyStorage,
            apiClient = apiClient
        )

        // If app starts and device is already paired, ensure background periodic work is scheduled
        val session = deviceRepository.deviceSession.value
        if (session.isPaired && session.pairingStatus != DeviceSession.STATUS_INVALID_SESSION) {
            heartbeatScheduler.schedulePeriodicHeartbeat()
        }
    }
}
