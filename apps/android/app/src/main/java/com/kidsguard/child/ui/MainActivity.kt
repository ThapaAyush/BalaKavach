package com.kidsguard.child.ui

import android.content.ComponentName
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.os.Bundle
import android.provider.Settings
import android.text.TextUtils
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
import com.kidsguard.child.data.model.BlockedAppDto
import com.kidsguard.child.data.model.DevicePolicyResponse
import com.kidsguard.child.data.model.DeviceSession
import com.kidsguard.child.data.model.ScreenTimeReportRequest
import com.kidsguard.child.databinding.ActivityMainBinding
import com.kidsguard.child.service.usage.UsageStatsHelper
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
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
        // Automatically synchronize any policy changes made from the website
        viewModel.autoSync()
        // Update quiet hours alert status for current time
        updateQuietHoursAlertUi(viewModel.cachedPolicy.value)
        // Update app restrictions alert banner
        updateAppRestrictionsAlertUi(viewModel.cachedPolicy.value)
        // Update daily limit alert banner
        updateDailyLimitAlertUi(viewModel.cachedPolicy.value, viewModel.todayUsage.value)
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

        // Grant Usage Access buttons (from Permissions tab and Screen Time banner)
        binding.btnGrantUsageAccess.setOnClickListener {
            openUsageSettings()
        }

        binding.btnGrantPermissionFromScreenTime.setOnClickListener {
            openUsageSettings()
        }

        binding.btnEnableAppBlocking.setOnClickListener {
            try {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            } catch (_: Exception) {
                Toast.makeText(this, "Please open Android Settings > Accessibility to enable KidsGuard.", Toast.LENGTH_LONG).show()
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
                    }
                }

                // Continuous automatic synchronization while activity is in foreground
                launch {
                    while (isActive) {
                        delay(AUTO_SYNC_INTERVAL_MS)
                        if (viewModel.deviceSession.value.isPaired) {
                            viewModel.autoSync()
                        }
                        updateQuietHoursAlertUi(viewModel.cachedPolicy.value)
                        updateAppRestrictionsAlertUi(viewModel.cachedPolicy.value)
                        updateDailyLimitAlertUi(viewModel.cachedPolicy.value, viewModel.todayUsage.value)
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
                        updateDailyLimitAlertUi(viewModel.cachedPolicy.value, usage)
                    }
                }

                launch {
                    viewModel.cachedPolicy.collect { policy ->
                        updateScreenTimeUi(
                            usage = viewModel.todayUsage.value,
                            policy = policy,
                            lastMeasurementTimeMs = viewModel.lastSuccessfulMeasurementTime.value
                        )
                        updateQuietHoursAlertUi(policy)
                        updateAppRestrictionsAlertUi(policy)
                        updateDailyLimitAlertUi(policy, viewModel.todayUsage.value)
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
        val deviceName = session.deviceName ?: "Android Device"
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

        // 3. Parent Daily Limit (Read-Only)
        val dailyLimitMin = policy?.dailyLimitMinutes
        val usedMinutes = if (usage?.totalScreenTimeSeconds != null) {
            usage.totalScreenTimeSeconds / 60
        } else {
            0
        }

        if (dailyLimitMin != null && dailyLimitMin > 0) {
            val formattedBudget = formatMinutesHuman(dailyLimitMin)
            binding.textDailyLimitBudget.text = "$formattedBudget daily allowance"
            binding.progressDailyLimit.visibility = View.VISIBLE

            val percent = ((usedMinutes.toDouble() / dailyLimitMin) * 100).toInt().coerceIn(0, 100)
            binding.progressDailyLimit.progress = percent

            binding.textDailyLimitBadge.visibility = View.VISIBLE
            binding.textDailyLimitRemaining.visibility = View.VISIBLE

            if (usedMinutes >= dailyLimitMin) {
                val overMinutes = usedMinutes - dailyLimitMin
                binding.textDailyLimitBadge.text = getString(R.string.daily_limit_reached_badge)
                binding.textDailyLimitBadge.setTextColor(ContextCompat.getColor(this, android.R.color.white))
                binding.textDailyLimitBadge.background = ContextCompat.getDrawable(this, R.color.status_red)

                binding.textDailyLimitRemaining.text = getString(
                    R.string.daily_limit_exceeded_format,
                    formatMinutesHuman(overMinutes),
                    formatMinutesHuman(usedMinutes),
                    formattedBudget
                )
                binding.textDailyLimitRemaining.setTextColor(ContextCompat.getColor(this, R.color.status_red))
                binding.progressDailyLimit.progressTintList = ContextCompat.getColorStateList(this, R.color.status_red)
            } else if (percent >= 80) {
                val remainingMinutes = dailyLimitMin - usedMinutes
                binding.textDailyLimitBadge.text = getString(R.string.daily_limit_near_badge)
                binding.textDailyLimitBadge.setTextColor(ContextCompat.getColor(this, android.R.color.white))
                binding.textDailyLimitBadge.background = ContextCompat.getDrawable(this, R.color.status_yellow)

                binding.textDailyLimitRemaining.text = getString(
                    R.string.daily_limit_remaining_format,
                    formatMinutesHuman(remainingMinutes),
                    formatMinutesHuman(usedMinutes),
                    formattedBudget
                )
                binding.textDailyLimitRemaining.setTextColor(ContextCompat.getColor(this, R.color.status_yellow))
                binding.progressDailyLimit.progressTintList = ContextCompat.getColorStateList(this, R.color.status_yellow)
            } else {
                val remainingMinutes = dailyLimitMin - usedMinutes
                binding.textDailyLimitBadge.text = getString(R.string.daily_limit_badge_on_track)
                binding.textDailyLimitBadge.setTextColor(ContextCompat.getColor(this, android.R.color.white))
                binding.textDailyLimitBadge.background = ContextCompat.getDrawable(this, R.color.status_green)

                binding.textDailyLimitRemaining.text = getString(
                    R.string.daily_limit_remaining_format,
                    formatMinutesHuman(remainingMinutes),
                    formatMinutesHuman(usedMinutes),
                    formattedBudget
                )
                binding.textDailyLimitRemaining.setTextColor(ContextCompat.getColor(this, R.color.text_secondary))
                binding.progressDailyLimit.progressTintList = ContextCompat.getColorStateList(this, R.color.accent)
            }
        } else {
            binding.textDailyLimitBudget.text = getString(R.string.no_limit_set)
            binding.textDailyLimitBadge.visibility = View.VISIBLE
            binding.textDailyLimitBadge.text = getString(R.string.daily_limit_badge_no_limit)
            binding.textDailyLimitBadge.setTextColor(ContextCompat.getColor(this, R.color.text_secondary))
            binding.textDailyLimitBadge.background = ContextCompat.getDrawable(this, R.color.border)
            binding.textDailyLimitRemaining.visibility = View.GONE
            binding.progressDailyLimit.visibility = View.GONE
        }

        val isQuietActive = isQuietHoursCurrentlyActive(policy)
        if (policy?.quietHoursEnabled == true) {
            val formattedRange = "${formatTime12Hour(policy.quietHoursStart)} – ${formatTime12Hour(policy.quietHoursEnd)}"
            val formattedDays = formatActiveDays(policy.quietHoursDays)

            binding.textQuietHoursDays.text = formattedDays
            binding.textQuietHoursDays.visibility = View.VISIBLE

            if (isQuietActive) {
                binding.textQuietHoursBadge.text = getString(R.string.quiet_hours_in_effect_badge)
                binding.textQuietHoursBadge.setTextColor(ContextCompat.getColor(this, android.R.color.white))
                binding.textQuietHoursBadge.background = ContextCompat.getDrawable(this, R.color.status_purple)
                binding.textQuietHoursBadge.visibility = View.VISIBLE

                binding.textQuietHoursSchedule.text = "Active Now: $formattedRange"
                binding.textQuietHoursSchedule.setTextColor(ContextCompat.getColor(this, R.color.status_purple))
            } else {
                binding.textQuietHoursBadge.text = getString(R.string.quiet_hours_scheduled_badge)
                binding.textQuietHoursBadge.setTextColor(ContextCompat.getColor(this, R.color.status_purple))
                binding.textQuietHoursBadge.background = ContextCompat.getDrawable(this, R.color.status_purple_light)
                binding.textQuietHoursBadge.visibility = View.VISIBLE

                binding.textQuietHoursSchedule.text = "Scheduled: $formattedRange"
                binding.textQuietHoursSchedule.setTextColor(ContextCompat.getColor(this, R.color.text_secondary))
            }
        } else {
            binding.textQuietHoursBadge.visibility = View.GONE
            binding.textQuietHoursDays.visibility = View.GONE
            binding.textQuietHoursSchedule.text = getString(R.string.quiet_hours_disabled)
            binding.textQuietHoursSchedule.setTextColor(ContextCompat.getColor(this, R.color.text_secondary))
        }

        // 4. Parental App Restrictions (Read-Only)
        updateAppRestrictionsSectionUi(policy, usage)

        // 5. Foreground App Usage Breakdown
        val blockedAppsList = policy?.appRestrictions?.takeIf { it.enabled }?.blockedApps ?: emptyList()
        val blockedPkgSet = blockedAppsList.map { it.packageName.lowercase() }.toSet()
        val blockedNameSet = blockedAppsList.map { it.appName.lowercase() }.filter { it.isNotBlank() }.toSet()

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
                val isBlocked = com.kidsguard.child.domain.rules.AppBlockingRuleEngine.isPackageBlocked(app.packageName, policy)
                val rowView = createAppUsageRow(app, isBlocked)
                binding.containerAppUsageList.addView(rowView)
            }
        }
    }

    private fun createAppUsageRow(app: AppUsageItemDto, isBlocked: Boolean): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 8, 0, 8)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            if (isBlocked) {
                background = ContextCompat.getDrawable(this@MainActivity, R.color.status_red_light)
            }
        }

        val nameView = TextView(this).apply {
            text = if (isBlocked) "${app.appName} 🚫" else app.appName
            textSize = 14f
            setTextColor(
                ContextCompat.getColor(
                    this@MainActivity,
                    if (isBlocked) R.color.status_red else R.color.text_primary
                )
            )
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            if (isBlocked) {
                typeface = android.graphics.Typeface.DEFAULT_BOLD
            }
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
            setTextColor(
                ContextCompat.getColor(
                    this@MainActivity,
                    if (isBlocked) R.color.status_red else R.color.text_secondary
                )
            )
        }

        row.addView(nameView)
        if (isBlocked) {
            val blockedBadge = TextView(this).apply {
                text = getString(R.string.badge_blocked)
                textSize = 9f
                setTextColor(ContextCompat.getColor(this@MainActivity, android.R.color.white))
                background = ContextCompat.getDrawable(this@MainActivity, R.color.status_red)
                setPadding(10, 3, 10, 3)
                typeface = android.graphics.Typeface.DEFAULT_BOLD
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    marginEnd = 12
                }
            }
            row.addView(blockedBadge)
        }
        row.addView(durationView)
        return row
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val service = com.kidsguard.child.service.blocking.AppBlockingAccessibilityService::class.java
        val expectedId = ComponentName(this, service).flattenToString()
        val enabledServices = Settings.Secure.getString(
            contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val colonSplitter = TextUtils.SimpleStringSplitter(':')
        colonSplitter.setString(enabledServices)
        while (colonSplitter.hasNext()) {
            val componentName = colonSplitter.next()
            if (componentName.equals(expectedId, ignoreCase = true) ||
                componentName.contains(service.simpleName, ignoreCase = true)
            ) {
                return true
            }
        }
        return false
    }

    private fun updateAppRestrictionsAlertUi(policy: DevicePolicyResponse?) {
        val appRestrictions = policy?.appRestrictions
        if (appRestrictions != null && appRestrictions.enabled && appRestrictions.blockedApps.isNotEmpty()) {
            binding.cardAppRestrictionsAlert.visibility = View.VISIBLE
            val count = appRestrictions.blockedApps.size
            val names = appRestrictions.blockedApps.joinToString(", ") { it.appName.ifBlank { it.packageName } }
            binding.textAppRestrictionsAlertList.text = "Restricted: $names"

            val isAccessibilityOn = isAccessibilityServiceEnabled()
            if (isAccessibilityOn) {
                binding.textTab0AppRestrictionsBadge.text = getString(R.string.accessibility_enabled_badge)
                binding.textTab0AppRestrictionsBadge.background = ContextCompat.getDrawable(this, R.color.status_green)
                binding.textAppRestrictionsAlertBody.text = getString(R.string.app_restrictions_active_body, count)
                binding.btnEnableAppBlocking.visibility = View.GONE
            } else {
                binding.textTab0AppRestrictionsBadge.text = getString(R.string.accessibility_disabled_badge)
                binding.textTab0AppRestrictionsBadge.background = ContextCompat.getDrawable(this, R.color.status_red)
                binding.textAppRestrictionsAlertBody.text = getString(R.string.accessibility_alert_body)
                binding.btnEnableAppBlocking.visibility = View.VISIBLE
            }
        } else {
            binding.cardAppRestrictionsAlert.visibility = View.GONE
        }
    }

    private fun updateAppRestrictionsSectionUi(
        policy: DevicePolicyResponse?,
        usage: ScreenTimeReportRequest?
    ) {
        val appRestrictions = policy?.appRestrictions
        val enabled = appRestrictions?.enabled == true
        val blockedList = appRestrictions?.blockedApps ?: emptyList()

        binding.containerBlockedAppsList.removeAllViews()

        if (enabled && blockedList.isNotEmpty()) {
            binding.textAppRestrictionsBadge.visibility = View.VISIBLE
            binding.textAppRestrictionsBadge.text = getString(R.string.app_restrictions_badge_active, blockedList.size)
            binding.textAppRestrictionsBadge.setTextColor(ContextCompat.getColor(this, android.R.color.white))
            binding.textAppRestrictionsBadge.background = ContextCompat.getDrawable(this, R.color.status_red)
            binding.textEmptyBlockedApps.visibility = View.GONE

            for (blockedApp in blockedList) {
                binding.containerBlockedAppsList.addView(createBlockedAppRow(blockedApp))
            }
        } else {
            binding.textAppRestrictionsBadge.visibility = View.VISIBLE
            binding.textAppRestrictionsBadge.text = getString(R.string.app_restrictions_badge_none)
            binding.textAppRestrictionsBadge.setTextColor(ContextCompat.getColor(this, R.color.text_secondary))
            binding.textAppRestrictionsBadge.background = ContextCompat.getDrawable(this, R.color.border)
            binding.textEmptyBlockedApps.visibility = View.VISIBLE
        }

        // Check if any app launched today violates parental restrictions
        val blockedPkgSet = blockedList.map { it.packageName.lowercase() }.toSet()
        val blockedNameSet = blockedList.map { it.appName.lowercase() }.filter { it.isNotBlank() }.toSet()
        val launchedBlockedApps = usage?.appUsage?.filter {
            blockedPkgSet.contains(it.packageName.lowercase()) ||
            blockedNameSet.contains(it.appName.lowercase())
        } ?: emptyList()

        if (enabled && launchedBlockedApps.isNotEmpty()) {
            val appNames = launchedBlockedApps.joinToString(", ") { it.appName }
            binding.cardBlockedAppLaunchWarning.visibility = View.VISIBLE
            binding.textBlockedAppLaunchWarning.text = getString(R.string.blocked_app_detected_warning, appNames)
        } else {
            binding.cardBlockedAppLaunchWarning.visibility = View.GONE
        }
    }

    private fun createBlockedAppRow(blockedApp: BlockedAppDto): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 10, 0, 10)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val infoLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val cleanName = blockedApp.appName.ifBlank { blockedApp.packageName.removePrefix("app.") }
        val nameView = TextView(this).apply {
            text = "🚫 $cleanName"
            textSize = 14f
            setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_primary))
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }
        infoLayout.addView(nameView)

        if (blockedApp.appName.isNotBlank() &&
            blockedApp.appName != blockedApp.packageName &&
            !blockedApp.packageName.startsWith("app.")
        ) {
            val pkgView = TextView(this).apply {
                text = blockedApp.packageName
                textSize = 11f
                setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_secondary))
            }
            infoLayout.addView(pkgView)
        }

        val badgeView = TextView(this).apply {
            text = getString(R.string.badge_blocked)
            textSize = 10f
            setTextColor(ContextCompat.getColor(this@MainActivity, android.R.color.white))
            background = ContextCompat.getDrawable(this@MainActivity, R.color.status_red)
            setPadding(14, 4, 14, 4)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }

        row.addView(infoLayout)
        row.addView(badgeView)
        return row
    }

    private fun updateQuietHoursAlertUi(policy: DevicePolicyResponse?) {
        val isCurrentlyActive = isQuietHoursCurrentlyActive(policy)
        if (isCurrentlyActive && policy != null) {
            binding.cardQuietHoursActiveAlert.visibility = View.VISIBLE
            val formattedTime = "${formatTime12Hour(policy.quietHoursStart)} – ${formatTime12Hour(policy.quietHoursEnd)}"
            val activeDays = formatActiveDays(policy.quietHoursDays)
            binding.textQuietHoursActiveTime.text = "$formattedTime • $activeDays"
        } else {
            binding.cardQuietHoursActiveAlert.visibility = View.GONE
        }
    }

    private fun updateDailyLimitAlertUi(
        policy: DevicePolicyResponse?,
        usage: ScreenTimeReportRequest?
    ) {
        val dailyLimitMin = policy?.dailyLimitMinutes
        if (dailyLimitMin == null || dailyLimitMin <= 0) {
            binding.cardDailyLimitAlert.visibility = View.GONE
            return
        }

        val usedMinutes = if (usage?.totalScreenTimeSeconds != null) {
            usage.totalScreenTimeSeconds / 60
        } else {
            0
        }
        val formattedBudget = formatMinutesHuman(dailyLimitMin)
        val formattedUsed = formatMinutesHuman(usedMinutes)
        val percent = ((usedMinutes.toDouble() / dailyLimitMin) * 100).toInt().coerceIn(0, 100)

        binding.cardDailyLimitAlert.visibility = View.VISIBLE
        binding.progressDailyLimitAlert.progress = percent

        if (usedMinutes >= dailyLimitMin) {
            // Limit reached or exceeded
            binding.cardDailyLimitAlert.strokeColor = ContextCompat.getColor(this, R.color.status_red)
            binding.layoutDailyLimitAlertBg.setBackgroundColor(ContextCompat.getColor(this, R.color.status_red_light))
            binding.textDailyLimitAlertTitle.text = getString(R.string.daily_limit_reached_title)
            binding.textDailyLimitAlertTitle.setTextColor(ContextCompat.getColor(this, R.color.status_red))

            binding.textDailyLimitAlertBadge.text = getString(R.string.daily_limit_reached_badge)
            binding.textDailyLimitAlertBadge.background = ContextCompat.getDrawable(this, R.color.status_red)

            binding.textDailyLimitAlertBody.text = getString(
                R.string.daily_limit_reached_body,
                formattedBudget,
                formattedUsed
            )
            binding.progressDailyLimitAlert.progressTintList = ContextCompat.getColorStateList(this, R.color.status_red)
        } else if (percent >= 80) {
            // Approaching limit (>= 80%)
            val remainingMin = dailyLimitMin - usedMinutes
            binding.cardDailyLimitAlert.strokeColor = ContextCompat.getColor(this, R.color.status_yellow)
            binding.layoutDailyLimitAlertBg.setBackgroundColor(ContextCompat.getColor(this, R.color.status_yellow_light))
            binding.textDailyLimitAlertTitle.text = getString(R.string.daily_limit_near_title)
            binding.textDailyLimitAlertTitle.setTextColor(ContextCompat.getColor(this, R.color.status_yellow))

            binding.textDailyLimitAlertBadge.text = getString(R.string.daily_limit_near_badge)
            binding.textDailyLimitAlertBadge.background = ContextCompat.getDrawable(this, R.color.status_yellow)

            binding.textDailyLimitAlertBody.text = getString(
                R.string.daily_limit_near_body,
                formattedUsed,
                formattedBudget,
                formatMinutesHuman(remainingMin)
            )
            binding.progressDailyLimitAlert.progressTintList = ContextCompat.getColorStateList(this, R.color.status_yellow)
        } else {
            // Active on-track budget
            val remainingMin = dailyLimitMin - usedMinutes
            binding.cardDailyLimitAlert.strokeColor = ContextCompat.getColor(this, R.color.accent)
            binding.layoutDailyLimitAlertBg.setBackgroundColor(ContextCompat.getColor(this, R.color.surface_variant))
            binding.textDailyLimitAlertTitle.text = getString(R.string.daily_limit_active_title)
            binding.textDailyLimitAlertTitle.setTextColor(ContextCompat.getColor(this, R.color.text_primary))

            binding.textDailyLimitAlertBadge.text = "${formatMinutesHuman(remainingMin)} left"
            binding.textDailyLimitAlertBadge.background = ContextCompat.getDrawable(this, R.color.accent)

            binding.textDailyLimitAlertBody.text = getString(
                R.string.daily_limit_active_body,
                formatMinutesHuman(remainingMin),
                formattedBudget,
                formattedUsed
            )
            binding.progressDailyLimitAlert.progressTintList = ContextCompat.getColorStateList(this, R.color.accent)
        }
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
        const val AUTO_SYNC_INTERVAL_MS = 3000L

        fun parseHourMinute(timeStr: String): Pair<Int, Int>? {
            val parts = timeStr.trim().split(":")
            if (parts.size != 2) return null
            val h = parts[0].toIntOrNull() ?: return null
            val m = parts[1].toIntOrNull() ?: return null
            if (h !in 0..23 || m !in 0..59) return null
            return Pair(h, m)
        }

        fun isQuietHoursCurrentlyActive(
            policy: DevicePolicyResponse?,
            now: Calendar = Calendar.getInstance()
        ): Boolean {
            if (policy == null || !policy.quietHoursEnabled) {
                return false
            }

            val startStr = policy.quietHoursStart ?: return false
            val endStr = policy.quietHoursEnd ?: return false

            val (startH, startM) = parseHourMinute(startStr) ?: return false
            val (endH, endM) = parseHourMinute(endStr) ?: return false

            val currentMinutes = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
            val startMinutes = startH * 60 + startM
            val endMinutes = endH * 60 + endM

            val dayName = when (now.get(Calendar.DAY_OF_WEEK)) {
                Calendar.SUNDAY -> "sunday"
                Calendar.MONDAY -> "monday"
                Calendar.TUESDAY -> "tuesday"
                Calendar.WEDNESDAY -> "wednesday"
                Calendar.THURSDAY -> "thursday"
                Calendar.FRIDAY -> "friday"
                Calendar.SATURDAY -> "saturday"
                else -> ""
            }

            val activeDays = policy.quietHoursDays.map { it.lowercase() }
            val isDayActive = activeDays.isEmpty() || activeDays.contains(dayName)

            return if (startMinutes < endMinutes) {
                isDayActive && (currentMinutes in startMinutes until endMinutes)
            } else if (startMinutes > endMinutes) {
                if (currentMinutes >= startMinutes && isDayActive) {
                    true
                } else if (currentMinutes < endMinutes) {
                    val prevDay = when (now.get(Calendar.DAY_OF_WEEK)) {
                        Calendar.SUNDAY -> "saturday"
                        Calendar.MONDAY -> "sunday"
                        Calendar.TUESDAY -> "monday"
                        Calendar.WEDNESDAY -> "tuesday"
                        Calendar.THURSDAY -> "wednesday"
                        Calendar.FRIDAY -> "thursday"
                        Calendar.SATURDAY -> "friday"
                        else -> ""
                    }
                    activeDays.isEmpty() || activeDays.contains(prevDay)
                } else {
                    false
                }
            } else {
                isDayActive
            }
        }

        fun formatTime12Hour(time24: String?): String {
            if (time24.isNullOrBlank()) return "—"
            val parts = time24.trim().split(":")
            if (parts.size != 2) return time24
            val h = parts[0].toIntOrNull() ?: return time24
            val m = parts[1].toIntOrNull() ?: return time24
            val amPm = if (h >= 12) "PM" else "AM"
            val h12 = when {
                h == 0 -> 12
                h > 12 -> h - 12
                else -> h
            }
            return String.format(Locale.getDefault(), "%d:%02d %s", h12, m, amPm)
        }

        fun formatActiveDays(days: List<String>): String {
            if (days.isEmpty() || days.size == 7) return "Every day (Mon – Sun)"
            val dayAbbrs = mapOf(
                "monday" to "Mon",
                "tuesday" to "Tue",
                "wednesday" to "Wed",
                "thursday" to "Thu",
                "friday" to "Fri",
                "saturday" to "Sat",
                "sunday" to "Sun"
            )
            return days.mapNotNull { dayAbbrs[it.lowercase()] }.joinToString(", ")
        }

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

        fun formatMinutesHuman(totalMinutes: Long): String {
            if (totalMinutes <= 0L) return "0m"
            val hours = totalMinutes / 60
            val minutes = totalMinutes % 60
            return when {
                hours > 0 && minutes > 0 -> "${hours}h ${minutes}m"
                hours > 0 -> "${hours}h"
                else -> "${minutes}m"
            }
        }

        fun formatMinutesHuman(totalMinutes: Int): String = formatMinutesHuman(totalMinutes.toLong())
    }
}
