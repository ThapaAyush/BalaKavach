package com.kidsguard.child.ui

import android.content.pm.ApplicationInfo
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
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Main activity for KidsGuard Child application.
 * Provides read-only visibility into device connection, screen time, parent rules, and permission guidance.
 * Contains NO child-side domain editing or unpairing controls.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    private val isDebuggable: Boolean by lazy {
        (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    }

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
        val tabs = resolveTabTitles(
            isDebuggable = isDebuggable,
            tabDevice = getString(R.string.tab_device),
            tabScreenTime = getString(R.string.tab_screen_time),
            tabPermissions = getString(R.string.tab_usage_access),
            tabSettings = getString(R.string.tab_settings)
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
                    3 -> if (isDebuggable) showSection(binding.sectionSettings)
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

        if (targetSection == binding.sectionSettings && !isDebuggable) {
            binding.sectionDevice.visibility = View.VISIBLE
            return
        }

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

            binding.textPairingError.visibility = View.GONE
            viewModel.clearPairingError()
            viewModel.pairDevice(code, name)
        }

        // Sync Now button
        binding.btnSyncNow.setOnClickListener {
            viewModel.syncNow()
        }

        // Grant Usage Access buttons (from Permissions tab and Screen Time banner)
        binding.btnGrantUsageAccess.setOnClickListener {
            openUsageSettings()
        }

        binding.btnGrantPermissionFromScreenTime.setOnClickListener {
            openUsageSettings()
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

    private fun openUsageSettings() {
        try {
            startActivity(UsageStatsHelper.createUsageAccessSettingsIntent())
        } catch (_: Exception) {
            Toast.makeText(
                this,
                "Unable to open system settings directly. Please open Android Settings > Apps > Special app access > Usage access.",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private fun observeViewModel() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                // Connection State (maps to Paired, Connecting, Offline, Needs Attention, Unpaired)
                launch {
                    viewModel.connectionState.collect { state ->
                        updateConnectionStateUi(state)
                    }
                }

                // Device Session Details
                launch {
                    viewModel.deviceSession.collect { session ->
                        updateDeviceSessionDetailsUi(session)
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
                        updateScreenTimeUi(
                            usage = usage,
                            policy = viewModel.cachedPolicy.value,
                            lastMeasurementTimeMs = viewModel.lastSuccessfulMeasurementTime.value
                        )
                    }
                }

                launch {
                    viewModel.cachedPolicy.collect { policy ->
                        updateScreenTimeUi(
                            usage = viewModel.todayUsage.value,
                            policy = policy,
                            lastMeasurementTimeMs = viewModel.lastSuccessfulMeasurementTime.value
                        )
                    }
                }

                launch {
                    viewModel.lastSuccessfulMeasurementTime.collect { measurementTime ->
                        updateScreenTimeUi(
                            usage = viewModel.todayUsage.value,
                            policy = viewModel.cachedPolicy.value,
                            lastMeasurementTimeMs = measurementTime
                        )
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

    private fun updateConnectionStateUi(state: ConnectionState) {
        when (state) {
            ConnectionState.UNPAIRED -> {
                binding.cardPairing.visibility = View.VISIBLE
                binding.cardStatus.visibility = View.GONE
                binding.cardOfflineAlert.visibility = View.GONE
                binding.cardNeedsAttentionAlert.visibility = View.GONE
                binding.textParentNotice.text = getString(R.string.parent_notice_unpaired)
                binding.textStatusBadge.text = getString(R.string.status_unpaired)
                binding.textStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.status_gray))
            }
            ConnectionState.CONNECTING -> {
                binding.textStatusBadge.text = getString(R.string.status_connecting)
                binding.textStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.status_blue))
            }
            ConnectionState.PAIRED -> {
                binding.cardPairing.visibility = View.GONE
                binding.cardStatus.visibility = View.VISIBLE
                binding.cardOfflineAlert.visibility = View.GONE
                binding.cardNeedsAttentionAlert.visibility = View.GONE
                binding.textParentNotice.text = getString(R.string.parent_notice_paired)
                binding.textStatusBadge.text = getString(R.string.status_paired)
                binding.textStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.status_green))
            }
            ConnectionState.OFFLINE -> {
                binding.cardPairing.visibility = View.GONE
                binding.cardStatus.visibility = View.VISIBLE
                binding.cardOfflineAlert.visibility = View.VISIBLE
                binding.cardNeedsAttentionAlert.visibility = View.GONE
                binding.textParentNotice.text = getString(R.string.parent_notice_paired)
                binding.textStatusBadge.text = getString(R.string.status_offline)
                binding.textStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.status_yellow))
            }
            ConnectionState.NEEDS_ATTENTION -> {
                binding.cardPairing.visibility = View.VISIBLE
                binding.cardStatus.visibility = View.VISIBLE
                binding.cardOfflineAlert.visibility = View.GONE
                binding.cardNeedsAttentionAlert.visibility = View.VISIBLE
                binding.textParentNotice.text = getString(R.string.parent_notice_unpaired)
                binding.textStatusBadge.text = getString(R.string.status_needs_attention)
                binding.textStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.status_red))
            }
        }
    }

    private fun updateDeviceSessionDetailsUi(session: DeviceSession) {
        val deviceName = session.deviceName ?: "Child Android Device"
        binding.textDeviceNameDisplay.text = "${getString(R.string.device_name_display_label)} $deviceName"
        binding.textDeviceId.text = "${getString(R.string.device_id_label)} ${session.deviceId ?: "—"}"
        binding.textPairedAt.text = "${getString(R.string.paired_at_label)} ${formatIsoTimestamp(session.pairedAt, "—")}"

        // Communication Timestamp (Last Seen or Last Heartbeat)
        val commTimestamp = session.lastSeenAt ?: session.lastHeartbeatAt
        val formattedComm = formatIsoTimestamp(commTimestamp, getString(R.string.no_communication_yet))
        binding.textLastCommunication.text = "${getString(R.string.last_communication_label)} $formattedComm"

        // Policy Sync Timestamp
        val formattedSync = formatIsoTimestamp(session.lastPolicySyncAt, getString(R.string.not_synced_yet))
        binding.textLastPolicySync.text = "${getString(R.string.last_policy_sync_label)} $formattedSync"

        binding.textPolicyVersionDisplay.text = "${getString(R.string.policy_version_label)} v${session.acknowledgedPolicyVersion}"
    }

    private fun updatePermissionUi(hasPermission: Boolean) {
        if (hasPermission) {
            binding.textPermissionBadge.text = getString(R.string.permission_granted_badge)
            binding.textPermissionBadge.setTextColor(ContextCompat.getColor(this, R.color.status_green))
            binding.btnGrantUsageAccess.visibility = View.GONE
            binding.cardUsageMissingBanner.visibility = View.GONE
        } else {
            binding.textPermissionBadge.text = getString(R.string.permission_denied_badge)
            binding.textPermissionBadge.setTextColor(ContextCompat.getColor(this, R.color.status_yellow))
            binding.btnGrantUsageAccess.visibility = View.VISIBLE
            binding.cardUsageMissingBanner.visibility = View.VISIBLE
        }
    }

    private fun updateScreenTimeUi(
        usage: ScreenTimeReportRequest?,
        policy: DevicePolicyResponse?,
        lastMeasurementTimeMs: Long?
    ) {
        val isMeasured = isScreenTimeSuccessfullyMeasured(usage)

        // 1. Measured Screen Time Duration & Zero-Fabrication Rule
        if (!isMeasured) {
            binding.textTodayScreenTime.text = getString(R.string.screen_time_unavailable)
            binding.textTodayScreenTime.textSize = 18f
            binding.textTodayScreenTime.setTextColor(ContextCompat.getColor(this, R.color.status_yellow))
            binding.cardUsageMissingBanner.visibility = View.VISIBLE

            // Truthful timestamps when usage measurement is unavailable
            binding.textReportingPeriod.text = formatReportingPeriod(
                isMeasured = false,
                lastMeasurementTimeMs = lastMeasurementTimeMs,
                unavailableText = getString(R.string.reporting_period_unavailable),
                periodFormat = getString(R.string.reporting_period_format)
            )
            binding.textLastMeasured.text = formatLastMeasured(
                isMeasured = false,
                lastMeasurementTimeMs = lastMeasurementTimeMs,
                unavailableText = getString(R.string.last_measured_unavailable),
                neverText = getString(R.string.last_measured_never),
                measuredFormat = getString(R.string.last_measured_label)
            )
        } else {
            binding.cardUsageMissingBanner.visibility = View.GONE
            val totalSec = usage!!.totalScreenTimeSeconds!!
            val hours = totalSec / 3600
            val minutes = (totalSec % 3600) / 60
            binding.textTodayScreenTime.text = when {
                hours > 0 -> getString(R.string.screen_time_format, hours, minutes)
                minutes > 0 -> getString(R.string.screen_time_minutes_only, minutes)
                else -> getString(R.string.screen_time_zero)
            }
            binding.textTodayScreenTime.textSize = 28f
            binding.textTodayScreenTime.setTextColor(ContextCompat.getColor(this, R.color.accent))

            // 2. Reporting Period and Last Measured Context for successful measurement
            binding.textReportingPeriod.text = formatReportingPeriod(
                isMeasured = true,
                lastMeasurementTimeMs = lastMeasurementTimeMs,
                unavailableText = getString(R.string.reporting_period_unavailable),
                periodFormat = getString(R.string.reporting_period_format)
            )
            binding.textLastMeasured.text = formatLastMeasured(
                isMeasured = true,
                lastMeasurementTimeMs = lastMeasurementTimeMs,
                unavailableText = getString(R.string.last_measured_unavailable),
                neverText = getString(R.string.last_measured_never),
                measuredFormat = getString(R.string.last_measured_label)
            )
        }

        // 3. Parent Daily Limit & Quiet Hours (Read-Only)
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

        // 4. Foreground App Usage Breakdown
        val appList = usage?.appUsage ?: emptyList()
        binding.containerAppUsageList.removeAllViews()

        if (usage != null && !usage.permissionGranted) {
            binding.textEmptyApps.text = getString(R.string.apps_unavailable_no_perm)
            binding.textEmptyApps.visibility = View.VISIBLE
        } else if (appList.isEmpty()) {
            binding.textEmptyApps.text = getString(R.string.no_apps_recorded)
            binding.textEmptyApps.visibility = View.VISIBLE
        } else {
            binding.textEmptyApps.visibility = View.GONE
            for (app in appList.take(25)) {
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

    private fun formatIsoTimestamp(isoString: String?, fallback: String): String {
        if (isoString.isNullOrBlank()) return fallback
        return try {
            val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
            val date = try {
                isoFormat.parse(isoString)
            } catch (_: Exception) {
                val fallbackIso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }
                fallbackIso.parse(isoString)
            }
            if (date != null) {
                val displayFormat = SimpleDateFormat("MMM d, yyyy, h:mm a", Locale.getDefault())
                displayFormat.format(date)
            } else {
                isoString
            }
        } catch (_: Exception) {
            isoString
        }
    }

    companion object {
        fun resolveTabTitles(
            isDebuggable: Boolean,
            tabDevice: String,
            tabScreenTime: String,
            tabPermissions: String,
            tabSettings: String
        ): List<String> {
            val tabs = mutableListOf(tabDevice, tabScreenTime, tabPermissions)
            if (isDebuggable) {
                tabs.add(tabSettings)
            }
            return tabs
        }

        fun isScreenTimeSuccessfullyMeasured(usage: ScreenTimeReportRequest?): Boolean {
            return usage != null && usage.permissionGranted && usage.totalScreenTimeSeconds != null
        }

        fun formatReportingPeriod(
            isMeasured: Boolean,
            lastMeasurementTimeMs: Long?,
            unavailableText: String,
            periodFormat: String
        ): String {
            if (!isMeasured || lastMeasurementTimeMs == null) {
                return unavailableText
            }
            val timeFormat = SimpleDateFormat("h:mm a", Locale.getDefault())
            val endStr = timeFormat.format(Date(lastMeasurementTimeMs))
            return String.format(periodFormat, "12:00 AM", endStr)
        }

        fun formatLastMeasured(
            isMeasured: Boolean,
            lastMeasurementTimeMs: Long?,
            unavailableText: String,
            neverText: String,
            measuredFormat: String
        ): String {
            if (!isMeasured) {
                return unavailableText
            }
            if (lastMeasurementTimeMs == null) {
                return neverText
            }
            val timeFormat = SimpleDateFormat("h:mm a", Locale.getDefault())
            val timeStr = timeFormat.format(Date(lastMeasurementTimeMs))
            return String.format(measuredFormat, timeStr)
        }
    }
}
