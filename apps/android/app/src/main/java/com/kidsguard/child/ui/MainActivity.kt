package com.kidsguard.child.ui

import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.google.android.material.tabs.TabLayout
import com.kidsguard.child.KidsGuardApp
import com.kidsguard.child.R
import com.kidsguard.child.data.model.AppUsageItemDto
import com.kidsguard.child.data.model.DevicePolicyResponse
import com.kidsguard.child.data.model.DeviceSession
import com.kidsguard.child.data.model.ScreenTimeReportRequest
import com.kidsguard.child.databinding.ActivityMainBinding
import com.kidsguard.child.service.usage.UsageStatsHelper
import kotlinx.coroutines.launch

/**
 * Main activity for KidsGuard Child application.
 * Provides read-only visibility into device connection, screen time, parent rules, and permission guidance.
 * Contains NO child-side domain editing or unpairing controls.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    private val viewModel: MainViewModel by viewModels {
        val app = application as KidsGuardApp
        MainViewModel.Factory(
            deviceRepository = app.deviceRepository,
            policyRepository = app.policyRepository,
            usageStatsReader = app.usageStatsReader,
            serverConfigStorage = app.serverConfigStorage
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupTabs()
        setupClickListeners()
        observeViewModel()
    }

    override fun onResume() {
        super.onResume()
        // Refresh usage permission status and measured stats when returning to the app
        viewModel.refreshUsageData()
    }

    private fun setupTabs() {
        val tabs = listOf(
            getString(R.string.tab_device),
            getString(R.string.tab_screen_time),
            getString(R.string.tab_usage_access),
            getString(R.string.tab_settings)
        )

        for (title in tabs) {
            binding.tabLayout.addTab(binding.tabLayout.newTab().setText(title))
        }

        binding.tabLayout.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab?) {
                when (tab?.position) {
                    0 -> showSection(binding.sectionDevice)
                    1 -> showSection(binding.sectionScreenTime)
                    2 -> showSection(binding.sectionUsageAccess)
                    3 -> showSection(binding.sectionSettings)
                }
            }

            override fun onTabUnselected(tab: TabLayout.Tab?) {}
            override fun onTabReselected(tab: TabLayout.Tab?) {}
        })
    }

    private fun showSection(targetSection: View) {
        binding.sectionDevice.visibility = View.GONE
        binding.sectionScreenTime.visibility = View.GONE
        binding.sectionUsageAccess.visibility = View.GONE
        binding.sectionSettings.visibility = View.GONE

        targetSection.visibility = View.VISIBLE
    }

    private fun setupClickListeners() {
        // Pairing button
        binding.btnPair.setOnClickListener {
            val code = binding.editPairingCode.text?.toString() ?: ""
            val name = binding.editDeviceName.text?.toString() ?: ""

            if (code.isBlank() || code.trim().length != 22) {
                binding.textPairingError.text = "Pairing code must be a 22-character string."
                binding.textPairingError.visibility = View.VISIBLE
                return@setOnClickListener
            }
            if (name.isBlank() || name.trim().length > 60) {
                binding.textPairingError.text = "Device name must be between 1 and 60 characters."
                binding.textPairingError.visibility = View.VISIBLE
                return@setOnClickListener
            }

            viewModel.clearPairingError()
            viewModel.pairDevice(code, name)
        }

        // Sync Now button
        binding.btnSyncNow.setOnClickListener {
            viewModel.syncNow()
        }

        // Grant Usage Access button
        binding.btnGrantUsageAccess.setOnClickListener {
            try {
                startActivity(UsageStatsHelper.createUsageAccessSettingsIntent())
            } catch (_: Exception) {
                Toast.makeText(this, "Unable to open system settings directly. Please open Android Settings > Apps > Special app access > Usage access.", Toast.LENGTH_LONG).show()
            }
        }

        // Settings API URL buttons
        binding.btnSaveApiUrl.setOnClickListener {
            val rawUrl = binding.editApiUrl.text?.toString() ?: ""
            if (viewModel.saveApiUrl(rawUrl)) {
                Toast.makeText(this, getString(R.string.url_saved_toast), Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnResetApiUrl.setOnClickListener {
            viewModel.resetApiUrl()
            binding.editApiUrl.setText(viewModel.apiUrl.value)
        }
    }

    private fun observeViewModel() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                // Device Session
                launch {
                    viewModel.deviceSession.collect { session ->
                        updateDeviceSessionUi(session)
                    }
                }

                // Pairing Loading
                launch {
                    viewModel.pairingLoading.collect { loading ->
                        binding.pairingProgressBar.visibility = if (loading) View.VISIBLE else View.GONE
                        binding.btnPair.isEnabled = !loading
                    }
                }

                // Pairing Error
                launch {
                    viewModel.pairingError.collect { error ->
                        if (!error.isNullOrBlank()) {
                            binding.textPairingError.text = error
                            binding.textPairingError.visibility = View.VISIBLE
                        } else {
                            binding.textPairingError.visibility = View.GONE
                        }
                    }
                }

                // Sync Loading
                launch {
                    viewModel.syncLoading.collect { loading ->
                        binding.syncProgressBar.visibility = if (loading) View.VISIBLE else View.GONE
                        binding.btnSyncNow.isEnabled = !loading
                    }
                }

                // Sync Message
                launch {
                    viewModel.syncMessage.collect { message ->
                        if (!message.isNullOrBlank()) {
                            binding.textSyncMessage.text = message
                            binding.textSyncMessage.visibility = View.VISIBLE
                        } else {
                            binding.textSyncMessage.visibility = View.GONE
                        }
                    }
                }

                // Usage Access Permission
                launch {
                    viewModel.hasUsagePermission.collect { granted ->
                        updatePermissionUi(granted)
                    }
                }

                // Screen-time Usage & Policy
                launch {
                    viewModel.todayUsage.collect { usage ->
                        updateScreenTimeUi(usage, viewModel.cachedPolicy.value)
                    }
                }

                launch {
                    viewModel.cachedPolicy.collect { policy ->
                        updateScreenTimeUi(viewModel.todayUsage.value, policy)
                    }
                }

                // API Base URL
                launch {
                    viewModel.apiUrl.collect { url ->
                        if (binding.editApiUrl.text?.toString() != url) {
                            binding.editApiUrl.setText(url)
                        }
                    }
                }

                // API URL Error
                launch {
                    viewModel.apiUrlError.collect { error ->
                        if (!error.isNullOrBlank()) {
                            binding.textApiUrlError.text = error
                            binding.textApiUrlError.visibility = View.VISIBLE
                        } else {
                            binding.textApiUrlError.visibility = View.GONE
                        }
                    }
                }

                // API URL Saved Message
                launch {
                    viewModel.apiUrlSavedMessage.collect { msg ->
                        if (!msg.isNullOrBlank()) {
                            Toast.makeText(this@MainActivity, msg, Toast.LENGTH_SHORT).show()
                            viewModel.clearApiUrlSavedMessage()
                        }
                    }
                }
            }
        }
    }

    private fun updateDeviceSessionUi(session: DeviceSession) {
        if (!session.isPaired) {
            // Unpaired state
            binding.cardPairing.visibility = View.VISIBLE
            binding.cardStatus.visibility = View.GONE
            binding.textStatusBadge.text = getString(R.string.status_unpaired)
            binding.textStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.text_secondary))
            return
        }

        binding.cardStatus.visibility = View.VISIBLE

        if (session.pairingStatus == DeviceSession.STATUS_INVALID_SESSION) {
            // Re-auth required: show pairing card so device can be re-linked with a new code
            binding.cardPairing.visibility = View.VISIBLE
            binding.textStatusBadge.text = getString(R.string.status_invalid_session)
            binding.textStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.status_red))
        } else {
            binding.cardPairing.visibility = View.GONE
            if (session.lastHeartbeatStatus == "offline") {
                binding.textStatusBadge.text = getString(R.string.status_offline)
                binding.textStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.status_yellow))
            } else if (session.lastHeartbeatStatus == "error") {
                binding.textStatusBadge.text = getString(R.string.status_error)
                binding.textStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.status_red))
            } else {
                binding.textStatusBadge.text = getString(R.string.status_paired)
                binding.textStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.status_green))
            }
        }

        binding.textDeviceId.text = "${getString(R.string.device_id_label)} ${session.deviceId ?: "—"}"
        binding.textDeviceNameDisplay.text = "${getString(R.string.device_name_display_label)} ${session.deviceName ?: "—"}"
        binding.textPairedAt.text = "${getString(R.string.paired_at_label)} ${session.pairedAt ?: "—"}"
        binding.textLastSeen.text = "${getString(R.string.last_seen_label)} ${session.lastSeenAt ?: "—"}"
        binding.textLastHeartbeat.text = "${getString(R.string.last_heartbeat_label)} ${session.lastHeartbeatAt ?: "—"}"
        binding.textPolicyVersionDisplay.text = "${getString(R.string.policy_version_label)} v${session.acknowledgedPolicyVersion}"
        binding.textLastPolicySync.text = "${getString(R.string.last_policy_sync_label)} ${session.lastPolicySyncAt ?: "—"}"
    }

    private fun updatePermissionUi(hasPermission: Boolean) {
        if (hasPermission) {
            binding.textPermissionBadge.text = getString(R.string.permission_granted_badge)
            binding.textPermissionBadge.setTextColor(ContextCompat.getColor(this, R.color.status_green))
            binding.btnGrantUsageAccess.visibility = View.GONE
        } else {
            binding.textPermissionBadge.text = getString(R.string.permission_denied_badge)
            binding.textPermissionBadge.setTextColor(ContextCompat.getColor(this, R.color.status_yellow))
            binding.btnGrantUsageAccess.visibility = View.VISIBLE
        }
    }

    private fun updateScreenTimeUi(
        usage: ScreenTimeReportRequest?,
        policy: DevicePolicyResponse?
    ) {
        // 1. Measured Screen Time
        if (usage == null || !usage.permissionGranted || usage.totalScreenTimeSeconds == null) {
            binding.textTodayScreenTime.text = getString(R.string.screen_time_unavailable)
            binding.textTodayScreenTime.textSize = 16f
            binding.textTodayScreenTime.setTextColor(ContextCompat.getColor(this, R.color.status_yellow))
        } else {
            val totalSec = usage.totalScreenTimeSeconds
            val hours = totalSec / 3600
            val minutes = (totalSec % 3600) / 60
            binding.textTodayScreenTime.text = when {
                hours > 0 -> getString(R.string.screen_time_format, hours, minutes)
                minutes > 0 -> getString(R.string.screen_time_minutes_only, minutes)
                else -> getString(R.string.screen_time_zero)
            }
            binding.textTodayScreenTime.textSize = 26f
            binding.textTodayScreenTime.setTextColor(ContextCompat.getColor(this, R.color.accent))
        }

        // 2. Parent Daily Limit & Quiet Hours
        val dailyLimitMin = policy?.dailyLimitMinutes
        if (dailyLimitMin != null && dailyLimitMin > 0) {
            binding.textDailyLimitBudget.text = getString(R.string.limit_format, dailyLimitMin)
            binding.progressDailyLimit.visibility = View.VISIBLE

            val usedMinutes = if (usage?.totalScreenTimeSeconds != null) {
                usage.totalScreenTimeSeconds / 60
            } else {
                0
            }
            val percent = ((usedMinutes.toDouble() / dailyLimitMin) * 100).toInt().coerceIn(0, 100)
            binding.progressDailyLimit.progress = percent

            if (usedMinutes >= dailyLimitMin) {
                binding.progressDailyLimit.progressTintList = ContextCompat.getColorStateList(this, R.color.status_red)
            } else {
                binding.progressDailyLimit.progressTintList = ContextCompat.getColorStateList(this, R.color.accent)
            }
        } else {
            binding.textDailyLimitBudget.text = getString(R.string.no_limit_set)
            binding.progressDailyLimit.visibility = View.GONE
        }

        if (policy?.quietHoursEnabled == true) {
            binding.textQuietHoursSchedule.text = getString(
                R.string.quiet_hours_format,
                policy.quietHoursStart ?: "21:00",
                policy.quietHoursEnd ?: "07:00"
            )
        } else {
            binding.textQuietHoursSchedule.text = getString(R.string.quiet_hours_disabled)
        }

        // 3. Top Apps Breakdown
        val appList = usage?.appUsage ?: emptyList()
        binding.containerAppUsageList.removeAllViews()

        if (appList.isEmpty()) {
            binding.textEmptyApps.visibility = View.VISIBLE
        } else {
            binding.textEmptyApps.visibility = View.GONE
            for (app in appList.take(15)) {
                val rowView = createAppUsageRow(app)
                binding.containerAppUsageList.addView(rowView)
            }
        }
    }

    private fun createAppUsageRow(app: AppUsageItemDto): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 8, 0, 8)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val nameView = TextView(this).apply {
            text = app.appName
            textSize = 14f
            setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_primary))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val hours = app.durationSeconds / 3600
        val minutes = (app.durationSeconds % 3600) / 60
        val durationStr = when {
            hours > 0 -> "${hours}h ${minutes}m"
            minutes > 0 -> "${minutes}m"
            else -> "< 1m"
        }

        val durationView = TextView(this).apply {
            text = durationStr
            textSize = 13f
            setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_secondary))
        }

        row.addView(nameView)
        row.addView(durationView)
        return row
    }
}
