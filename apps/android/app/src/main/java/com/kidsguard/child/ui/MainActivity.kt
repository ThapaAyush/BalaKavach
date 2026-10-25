package com.kidsguard.child.ui

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.ComponentName
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.os.Bundle
import android.provider.Settings
import android.text.TextUtils
import android.view.GestureDetector
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.widget.LinearLayout
import android.widget.ProgressBar
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
import com.kidsguard.child.domain.rules.ScreenTimeLimitManager
import com.kidsguard.child.data.model.BlockedAppDto
import com.kidsguard.child.data.model.DevicePolicyResponse
import com.kidsguard.child.data.model.DeviceSession
import com.kidsguard.child.data.model.ScreenTimeReportRequest
import com.kidsguard.child.databinding.ActivityMainBinding
import com.kidsguard.child.service.usage.UsageStatsHelper
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs

/**
 * Main activity for KidsGuard Child application.
 * Provides read-only visibility into device connection, screen time, parent rules, and permission guidance.
 * Contains NO child-side domain editing or unpairing controls.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var liveTickerJob: Job? = null
    private var activeMetric: String = "screenTime" // "screenTime" | "appOpens"

    // Hand Animation & Horizontal Swipe Gesture support
    private var handAnimator: ObjectAnimator? = null
    private lateinit var gestureDetector: GestureDetector
    private var swipeStartX = 0f
    private var swipeStartY = 0f
    private var isHorizontalSwipeTracking = false
    private var currentSectionPosition = 0
    private var lastSwipeSwitchTimeMs = 0L

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private val isDebuggable: Boolean by lazy {
        (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    }

    private val viewModel: MainViewModel by viewModels {
        val app = application as KidsGuardApp
        MainViewModel.Factory(
            deviceRepository = app.deviceRepository,
            policyRepository = app.policyRepository,
            usageStatsReader = app.usageStatsReader,
            serverConfigStorage = app.serverConfigStorage,
            appUpdateManager = app.appUpdateManager
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.clockRealTime.format12Hour = "h:mm a"
        binding.clockRealTime.format24Hour = "HH:mm"

        setupTabs()
        setupHandGestureGuide()
        setupSwipeGestures()
        setupClickListeners()
        observeViewModel()
    }

    override fun onResume() {
        super.onResume()
        // Refresh usage permission status and measured stats when returning to the app
        viewModel.refreshUsageData()
        // Proactively synchronize policies, heartbeat, and measured screen-time to the cloud backend
        if (viewModel.deviceSession.value.isPaired) {
            viewModel.autoSync(uploadScreenTime = true)
        }
        // Update quiet hours alert status for current time
        updateQuietHoursAlertUi(viewModel.cachedPolicy.value)
        // Update app restrictions alert banner
        updateAppRestrictionsAlertUi(viewModel.cachedPolicy.value)
        // Update daily limit alert banner
        updateDailyLimitAlertUi(viewModel.cachedPolicy.value, viewModel.todayUsage.value)
        // Check for application updates from backend (non-intrusive)
        viewModel.checkForAppUpdate(
            currentVersionCode = com.kidsguard.child.BuildConfig.VERSION_CODE,
            currentVersionName = com.kidsguard.child.BuildConfig.VERSION_NAME,
            isManual = false
        )
        // Start live ticker to update real-time screen stats while active on screen
        startLiveRealTimeTicker()
        // Start continuous hand swipe animation guide
        startHandSwipeAnimation()
    }

    override fun onPause() {
        super.onPause()
        liveTickerJob?.cancel()
        liveTickerJob = null
        handAnimator?.cancel()
        handAnimator = null
    }

    private var lastScreenTimeUploadTimeMs = 0L

    private fun startLiveRealTimeTicker() {
        liveTickerJob?.cancel()
        liveTickerJob = lifecycleScope.launch {
            while (isActive) {
                delay(3000L)
                viewModel.refreshUsageData()
                updateQuietHoursAlertUi(viewModel.cachedPolicy.value)
                updateDailyLimitAlertUi(viewModel.cachedPolicy.value, viewModel.todayUsage.value)

                // Periodically upload updated screen-time telemetry while app is active in foreground
                val now = System.currentTimeMillis()
                if (now - lastScreenTimeUploadTimeMs >= 45000L && viewModel.deviceSession.value.isPaired) {
                    lastScreenTimeUploadTimeMs = now
                    viewModel.autoSync(uploadScreenTime = true)
                }
            }
        }
    }

    private fun setupTabs() {
        val tabs = resolveTabTitles(
            isDebuggable = isDebuggable,
            tabDevice = getString(R.string.tab_device),
            tabScreenTime = getString(R.string.tab_screen_time),
            tabSettings = getString(R.string.tab_settings)
        )

        for (title in tabs) {
            binding.tabLayout.addTab(binding.tabLayout.newTab().setText(title))
        }

        binding.tabLayout.addOnTabSelectedListener(object : TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: TabLayout.Tab?) {
                val newPos = tab?.position ?: 0
                val animateFromRight = if (newPos != currentSectionPosition) newPos > currentSectionPosition else null
                when (newPos) {
                    0 -> showSection(binding.sectionDevice, animateFromRight)
                    1 -> showSection(binding.sectionScreenTime, animateFromRight)
                    2 -> if (isDebuggable) showSection(binding.sectionSettings, animateFromRight)
                }
                currentSectionPosition = newPos
                updateHandGuideText(newPos)
            }

            override fun onTabUnselected(tab: TabLayout.Tab?) {}
            override fun onTabReselected(tab: TabLayout.Tab?) {}
        })
    }

    private fun setupHandGestureGuide() {
        updateHandGuideText(binding.tabLayout.selectedTabPosition)
        startHandSwipeAnimation()

        // Tapping the card cycles to next tab
        binding.cardHandGestureGuide.setOnClickListener {
            switchTabBySwipe(forward = true)
        }

        // Dismiss button smoothly hides the guide
        binding.btnDismissHandGuide.setOnClickListener {
            binding.cardHandGestureGuide.animate()
                .alpha(0f)
                .translationY(-dp(10).toFloat())
                .setDuration(180L)
                .withEndAction {
                    binding.cardHandGestureGuide.visibility = View.GONE
                }
                .start()
        }
    }

    private fun startHandSwipeAnimation() {
        val handView = binding.imageAnimatedHand ?: return
        handAnimator?.cancel()

        val distance = dp(14).toFloat()
        handAnimator = ObjectAnimator.ofFloat(handView, View.TRANSLATION_X, -distance, distance).apply {
            duration = 1000L
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener { animator ->
                val currentVal = animator.animatedValue as Float
                val fraction = animator.animatedFraction
                handView.rotation = (fraction * 16f) - 8f

                if (currentVal < 0) {
                    binding.textLeftArrowHint.alpha = 0.35f + (abs(currentVal) / distance) * 0.65f
                    binding.textRightArrowHint.alpha = 0.25f
                } else {
                    binding.textRightArrowHint.alpha = 0.35f + (currentVal / distance) * 0.65f
                    binding.textLeftArrowHint.alpha = 0.25f
                }
            }
            start()
        }
    }

    private fun updateHandGuideText(position: Int) {
        val tabCount = binding.tabLayout.tabCount
        when (position) {
            0 -> {
                binding.textHandGuideTitle.text = "Swipe ⟵ for Screen Time"
                binding.textHandGuideHint.text = "● Connection  ⟶  Screen Time"
            }
            1 -> {
                if (tabCount > 2) {
                    binding.textHandGuideTitle.text = "Swipe ⟵ for Settings, ⟶ for Connection"
                    binding.textHandGuideHint.text = "⟵ Connection  •  Screen Time ●  •  Settings ⟶"
                } else {
                    binding.textHandGuideTitle.text = "Swipe ⟶ for Connection"
                    binding.textHandGuideHint.text = "⟵ Connection  •  Screen Time ●"
                }
            }
            2 -> {
                binding.textHandGuideTitle.text = "Swipe ⟶ for Screen Time"
                binding.textHandGuideHint.text = "Screen Time  ⟵  Settings ●"
            }
            else -> {
                binding.textHandGuideTitle.text = "Swipe to switch tabs"
                binding.textHandGuideHint.text = "Connection • Screen Time • Settings"
            }
        }
    }

    private fun setupSwipeGestures() {
        val swipeThreshold = dp(45)
        val velocityThreshold = dp(90)

        gestureDetector = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onFling(
                e1: MotionEvent?,
                e2: MotionEvent,
                velocityX: Float,
                velocityY: Float
            ): Boolean {
                if (e1 == null) return false
                val diffX = e2.x - e1.x
                val diffY = e2.y - e1.y
                if (abs(diffX) > abs(diffY) * 1.2f &&
                    abs(diffX) > swipeThreshold &&
                    abs(velocityX) > velocityThreshold
                ) {
                    if (diffX < 0) {
                        switchTabBySwipe(forward = true)
                        return true
                    } else if (diffX > 0) {
                        switchTabBySwipe(forward = false)
                        return true
                    }
                }
                return false
            }
        })
    }

    private fun switchTabBySwipe(forward: Boolean) {
        val now = System.currentTimeMillis()
        if (now - lastSwipeSwitchTimeMs < 280L) return
        lastSwipeSwitchTimeMs = now

        val current = binding.tabLayout.selectedTabPosition
        val total = binding.tabLayout.tabCount
        if (total <= 1) return

        val target = if (forward) {
            if (current < total - 1) current + 1 else null
        } else {
            if (current > 0) current - 1 else null
        }

        if (target != null) {
            try {
                binding.root.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
            } catch (_: Throwable) {
                // Ignore if haptics unavailable
            }
            binding.tabLayout.getTabAt(target)?.select()
        } else {
            // Edge rubber-band visual feedback when attempting to swipe past boundaries
            val activeSection = when (current) {
                0 -> binding.sectionDevice
                1 -> binding.sectionScreenTime
                else -> binding.sectionSettings
            }
            val bounceDistance = if (forward) -dp(24).toFloat() else dp(24).toFloat()
            activeSection.animate()
                .translationX(bounceDistance)
                .setDuration(90L)
                .withEndAction {
                    activeSection.animate().translationX(0f).setDuration(120L).start()
                }
                .start()
        }
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (::gestureDetector.isInitialized) {
            gestureDetector.onTouchEvent(ev)
        }

        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                swipeStartX = ev.rawX
                swipeStartY = ev.rawY
                isHorizontalSwipeTracking = false
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = ev.rawX - swipeStartX
                val dy = ev.rawY - swipeStartY
                if (!isHorizontalSwipeTracking &&
                    abs(dx) > dp(26) &&
                    abs(dx) > abs(dy) * 1.4f
                ) {
                    isHorizontalSwipeTracking = true
                    // Cancel vertical scroll in children while swiping horizontally
                    val cancelEvent = MotionEvent.obtain(ev).apply { action = MotionEvent.ACTION_CANCEL }
                    super.dispatchTouchEvent(cancelEvent)
                    cancelEvent.recycle()
                    return true
                }
                if (isHorizontalSwipeTracking) {
                    return true
                }
            }
            MotionEvent.ACTION_UP -> {
                if (isHorizontalSwipeTracking) {
                    val dx = ev.rawX - swipeStartX
                    if (abs(dx) > dp(45)) {
                        if (dx < 0) {
                            switchTabBySwipe(forward = true)
                        } else {
                            switchTabBySwipe(forward = false)
                        }
                    }
                    isHorizontalSwipeTracking = false
                    return true
                }
                isHorizontalSwipeTracking = false
            }
            MotionEvent.ACTION_CANCEL -> {
                isHorizontalSwipeTracking = false
            }
        }

        return super.dispatchTouchEvent(ev)
    }

    private fun showSection(targetSection: View, animateFromRight: Boolean? = null) {
        binding.sectionDevice.visibility = View.GONE
        binding.sectionScreenTime.visibility = View.GONE
        binding.sectionSettings.visibility = View.GONE

        if (targetSection == binding.sectionSettings && !isDebuggable) {
            binding.sectionDevice.visibility = View.VISIBLE
            return
        }

        targetSection.visibility = View.VISIBLE
        binding.mainScrollView.smoothScrollTo(0, 0)

        if (animateFromRight != null) {
            val startX = if (animateFromRight) dp(60).toFloat() else -dp(60).toFloat()
            targetSection.translationX = startX
            targetSection.alpha = 0.35f
            targetSection.animate()
                .translationX(0f)
                .alpha(1f)
                .setDuration(200L)
                .setInterpolator(DecelerateInterpolator())
                .start()
        } else {
            targetSection.translationX = 0f
            targetSection.alpha = 1f
        }
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

        // Grant Usage Access button from Screen Time banner
        binding.btnGrantPermissionFromScreenTime.setOnClickListener {
            openUsageSettings()
        }

        // Manual Sync Buttons to push telemetry and pull policies immediately
        binding.btnSyncScreenTime.setOnClickListener {
            if (viewModel.deviceSession.value.isPaired) {
                viewModel.syncNow(isSilent = false)
            } else {
                Toast.makeText(this, "Device is not paired yet.", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnSyncDevice.setOnClickListener {
            if (viewModel.deviceSession.value.isPaired) {
                viewModel.syncNow(isSilent = false)
            } else {
                Toast.makeText(this, "Device is not paired yet.", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnEnableAppBlocking.setOnClickListener {
            try {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            } catch (_: Exception) {
                Toast.makeText(this, "Please open Android Settings > Accessibility to enable KidsGuard.", Toast.LENGTH_LONG).show()
            }
        }

        // Summary Card Clicks to switch modes (Timing vs App Opens)
        binding.cardScreenTimeSummary.setOnClickListener {
            activeMetric = "screenTime"
            updateScreenTimeUi(
                usage = viewModel.todayUsage.value,
                policy = viewModel.cachedPolicy.value,
                lastMeasurementTimeMs = viewModel.lastSuccessfulMeasurementTime.value
            )
        }

        binding.cardMetricMobilePickups.setOnClickListener {
            activeMetric = "appOpens"
            updateScreenTimeUi(
                usage = viewModel.todayUsage.value,
                policy = viewModel.cachedPolicy.value,
                lastMeasurementTimeMs = viewModel.lastSuccessfulMeasurementTime.value
            )
        }

        binding.cardMetricAppLaunches.setOnClickListener {
            activeMetric = "appOpens"
            updateScreenTimeUi(
                usage = viewModel.todayUsage.value,
                policy = viewModel.cachedPolicy.value,
                lastMeasurementTimeMs = viewModel.lastSuccessfulMeasurementTime.value
            )
        }

        // In-table Capsule Switcher Clicks
        binding.btnFilterTiming.setOnClickListener {
            activeMetric = "screenTime"
            updateScreenTimeUi(
                usage = viewModel.todayUsage.value,
                policy = viewModel.cachedPolicy.value,
                lastMeasurementTimeMs = viewModel.lastSuccessfulMeasurementTime.value
            )
        }

        binding.btnFilterAppOpens.setOnClickListener {
            activeMetric = "appOpens"
            updateScreenTimeUi(
                usage = viewModel.todayUsage.value,
                policy = viewModel.cachedPolicy.value,
                lastMeasurementTimeMs = viewModel.lastSuccessfulMeasurementTime.value
            )
        }

        // Settings API URL buttons
        binding.btnPresetCloud.setOnClickListener {
            val cloudUrl = "https://balakavach-be.onrender.com/api/v1"
            binding.editApiUrl.setText(cloudUrl)
            if (viewModel.saveApiUrl(cloudUrl)) {
                Toast.makeText(this, "Connected to Render Cloud backend", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnPresetEmulator.setOnClickListener {
            val emuUrl = "http://10.0.2.2:5000/api/v1"
            binding.editApiUrl.setText(emuUrl)
            if (viewModel.saveApiUrl(emuUrl)) {
                Toast.makeText(this, "Set to Local Emulator loopback", Toast.LENGTH_SHORT).show()
            }
        }

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

        // Current version display in Settings
        binding.textCurrentVersion.text = "Version: v${com.kidsguard.child.BuildConfig.VERSION_NAME}"

        // App Update Banner Buttons
        binding.btnDismissUpdate.setOnClickListener {
            viewModel.dismissUpdate()
        }

        binding.btnUpdateNow.setOnClickListener {
            val updateInfo = viewModel.appUpdateInfo.value ?: return@setOnClickListener
            val app = application as KidsGuardApp
            binding.progressUpdateDownload.visibility = View.VISIBLE
            binding.textUpdateStatus.visibility = View.VISIBLE
            binding.textUpdateStatus.text = "Starting update download..."
            binding.btnUpdateNow.isEnabled = false

            val downloadId = app.appUpdateManager.startDownloadAndInstall(
                updateInfo = updateInfo,
                onDownloadStarted = {
                    runOnUiThread {
                        binding.textUpdateStatus.text = "Downloading update in background..."
                    }
                },
                onError = { errorMsg ->
                    runOnUiThread {
                        binding.progressUpdateDownload.visibility = View.GONE
                        binding.textUpdateStatus.text = "Download error: $errorMsg"
                        binding.btnUpdateNow.isEnabled = true
                        Toast.makeText(this@MainActivity, "Download error: $errorMsg. Try downloading from web.", Toast.LENGTH_LONG).show()
                    }
                }
            )

            if (downloadId == -1L) {
                binding.progressUpdateDownload.visibility = View.GONE
                binding.btnUpdateNow.isEnabled = true
            }
        }

        binding.btnUpdateBrowser.setOnClickListener {
            val updateInfo = viewModel.appUpdateInfo.value ?: return@setOnClickListener
            val app = application as KidsGuardApp
            app.appUpdateManager.openInBrowser(this, updateInfo)
        }

        binding.btnCheckForUpdates.setOnClickListener {
            viewModel.checkForAppUpdate(
                currentVersionCode = com.kidsguard.child.BuildConfig.VERSION_CODE,
                currentVersionName = com.kidsguard.child.BuildConfig.VERSION_NAME,
                isManual = true
            )
        }

        binding.cardOfflineAlert.setOnClickListener {
            Toast.makeText(this, "Reconnecting to BalaKavach server...", Toast.LENGTH_SHORT).show()
            viewModel.autoSync(uploadScreenTime = true)
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

                // Sync Loading State
                launch {
                    viewModel.syncLoading.collect { loading ->
                        binding.syncProgressBar.visibility = if (loading) View.VISIBLE else View.GONE
                        binding.progressScreenTimeSync.visibility = if (loading) View.VISIBLE else View.GONE
                        binding.btnSyncScreenTime.isEnabled = !loading
                        binding.btnSyncDevice.isEnabled = !loading
                        if (loading) {
                            binding.btnSyncScreenTime.text = "Syncing…"
                            binding.btnSyncDevice.text = "Syncing…"
                        } else {
                            binding.btnSyncScreenTime.text = "Sync"
                            binding.btnSyncDevice.text = "Sync Now"
                        }
                    }
                }

                // Sync Message
                launch {
                    viewModel.syncMessage.collect { message ->
                        if (!message.isNullOrBlank()) {
                            val cleanMsg = when {
                                message.contains("Too many heartbeat requests", ignoreCase = true) -> "Please wait a moment"
                                message.startsWith("Synced with Dashboard") -> "Synced"
                                else -> message
                            }
                            binding.textSyncMessage.text = cleanMsg
                            binding.textSyncMessage.visibility = View.VISIBLE
                            binding.textScreenTimeSyncStatus.text = cleanMsg
                            binding.textScreenTimeSyncStatus.visibility = View.VISIBLE
                            val isSuccess = message.startsWith("Synced with Dashboard") || cleanMsg == "Synced"
                            val colorRes = if (isSuccess) R.color.status_green else R.color.status_red
                            binding.textSyncMessage.setTextColor(ContextCompat.getColor(this@MainActivity, colorRes))
                            binding.textScreenTimeSyncStatus.setTextColor(ContextCompat.getColor(this@MainActivity, colorRes))
                            if (isSuccess) {
                                Toast.makeText(this@MainActivity, cleanMsg, Toast.LENGTH_SHORT).show()
                            }
                        } else {
                            binding.textSyncMessage.visibility = View.GONE
                            binding.textScreenTimeSyncStatus.visibility = View.GONE
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

                // App Update Info Banner Observer
                launch {
                    viewModel.appUpdateInfo.collect { updateInfo ->
                        if (updateInfo != null && updateInfo.updateAvailable) {
                            binding.cardAppUpdateBanner.visibility = View.VISIBLE
                            binding.textUpdateTitle.text = "New Update Available: v${updateInfo.latestVersionName}"
                            binding.textUpdateSubtitle.text = if (updateInfo.releaseNotes.isNotBlank()) {
                                updateInfo.releaseNotes
                            } else {
                                "Tap update to install latest companion build smoothly."
                            }
                        } else {
                            binding.cardAppUpdateBanner.visibility = View.GONE
                        }
                    }
                }

                // Manual Update Check Loading Observer
                launch {
                    viewModel.updateCheckLoading.collect { loading ->
                        binding.btnCheckForUpdates.isEnabled = !loading
                        binding.btnCheckForUpdates.text = if (loading) "Checking…" else "Check Updates"
                    }
                }

                // Manual Update Check Status Message Observer
                launch {
                    viewModel.updateCheckStatusMessage.collect { status ->
                        if (!status.isNullOrBlank()) {
                            binding.textManualUpdateStatus.visibility = View.VISIBLE
                            binding.textManualUpdateStatus.text = status
                            Toast.makeText(this@MainActivity, status, Toast.LENGTH_SHORT).show()
                        } else {
                            binding.textManualUpdateStatus.visibility = View.GONE
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
                binding.cardAdultProtectionShield.visibility = View.GONE
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
                binding.cardAdultProtectionShield.visibility = View.VISIBLE
                binding.textParentNotice.text = getString(R.string.parent_notice_paired)
                binding.textStatusBadge.text = getString(R.string.status_paired)
                binding.textStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.status_green))
            }
            ConnectionState.OFFLINE -> {
                binding.cardPairing.visibility = View.GONE
                binding.cardStatus.visibility = View.VISIBLE
                binding.cardOfflineAlert.visibility = View.VISIBLE
                binding.cardNeedsAttentionAlert.visibility = View.GONE
                binding.cardAdultProtectionShield.visibility = View.VISIBLE
                binding.textParentNotice.text = getString(R.string.parent_notice_paired)
                binding.textStatusBadge.text = getString(R.string.status_offline)
                binding.textStatusBadge.setTextColor(ContextCompat.getColor(this, R.color.status_yellow))
            }
            ConnectionState.NEEDS_ATTENTION -> {
                binding.cardPairing.visibility = View.VISIBLE
                binding.cardStatus.visibility = View.VISIBLE
                binding.cardOfflineAlert.visibility = View.GONE
                binding.cardNeedsAttentionAlert.visibility = View.VISIBLE
                binding.cardAdultProtectionShield.visibility = View.VISIBLE
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

        binding.textPolicyVersionDisplay.text = "Policy v${session.acknowledgedPolicyVersion}"
    }

    private fun updatePermissionUi(hasPermission: Boolean) {
        if (hasPermission) {
            binding.cardUsageMissingBanner.visibility = View.GONE
        } else {
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
            binding.textScreenTimeActiveApps.text = "Usage access required"
            binding.textBadgeScreenTime.text = "Needs Permission"
            binding.textBadgeScreenTime.background = ContextCompat.getDrawable(this, R.drawable.bg_badge_pill_danger)
            binding.textBadgeScreenTime.setTextColor(ContextCompat.getColor(this, R.color.status_red))

            binding.textDeviceOpens.text = "0"
            binding.textTotalAppLaunches.text = "0"
            binding.textBadgeMobilePickups.visibility = View.GONE
            binding.textBadgeAppLaunches.visibility = View.GONE

            binding.dotLiveIndicator.visibility = View.GONE
            binding.textLiveStatus.visibility = View.GONE

            // Truthful timestamps when usage measurement is unavailable (hidden from UI)
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

            val deviceOpens = usage.deviceUnlockCount
            val totalAppOpens = usage.appUsage.sumOf { it.openCount }
            binding.textDeviceOpens.text = "$deviceOpens"
            binding.textDeviceOpensUnit.text = if (deviceOpens == 1) "unlock" else "unlocks"
            binding.textTotalAppLaunches.text = "$totalAppOpens"
            binding.textTotalAppLaunchesUnit.text = if (totalAppOpens == 1) "open" else "opens"

            binding.dotLiveIndicator.visibility = View.VISIBLE
            binding.textLiveStatus.visibility = View.VISIBLE

            // Legacy reporting period and last measured (hidden from UI)
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
        val usedMinutes = ScreenTimeLimitManager.computeUsedMinutesForLimit(this, policy, usage)

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
                binding.textDailyLimitBadge.backgroundTintList = ContextCompat.getColorStateList(this, R.color.status_red)

                if (overMinutes > 0) {
                    binding.textDailyLimitRemaining.text = getString(
                        R.string.daily_limit_exceeded_format,
                        formatMinutesHuman(overMinutes),
                        formatMinutesHuman(usedMinutes),
                        formattedBudget
                    )
                } else {
                    binding.textDailyLimitRemaining.text = "Daily limit reached ($formattedBudget used of $formattedBudget budget)"
                }
                binding.textDailyLimitRemaining.setTextColor(ContextCompat.getColor(this, R.color.status_red))
                binding.progressDailyLimit.progressTintList = ContextCompat.getColorStateList(this, R.color.status_red)
            } else if (percent >= 80) {
                val remainingMinutes = dailyLimitMin - usedMinutes
                binding.textDailyLimitBadge.text = getString(R.string.daily_limit_near_badge)
                binding.textDailyLimitBadge.setTextColor(ContextCompat.getColor(this, android.R.color.white))
                binding.textDailyLimitBadge.backgroundTintList = ContextCompat.getColorStateList(this, R.color.status_yellow)

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
                binding.textDailyLimitBadge.backgroundTintList = ContextCompat.getColorStateList(this, R.color.status_green)

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
            binding.textDailyLimitBadge.backgroundTintList = ContextCompat.getColorStateList(this, R.color.border)
            binding.textDailyLimitRemaining.visibility = View.GONE
            binding.progressDailyLimit.visibility = View.GONE
        }

        val isQuietActive = isQuietHoursCurrentlyActive(policy)
        if (policy?.quietHoursEnabled == true) {
            val formattedRange = "${formatTime12Hour(policy.quietHoursStart)} – ${formatTime12Hour(policy.quietHoursEnd)}"
            val formattedDays = formatActiveDays(policy.quietHoursDays)

            binding.textQuietHoursDays.text = formattedDays
            binding.textQuietHoursSchedule.text = if (isQuietActive) "Active Now: $formattedRange" else "Scheduled: $formattedRange"

            binding.containerQuietHoursDetails.visibility = View.VISIBLE
            binding.textQuietHoursStartTime.text = formatTime12Hour(policy.quietHoursStart)
            binding.textQuietHoursEndTime.text = formatTime12Hour(policy.quietHoursEnd)

            val activeDaysSet = policy.quietHoursDays.map { it.lowercase() }.toSet()
            updateDayChip(binding.chipDayMon, activeDaysSet.contains("monday"))
            updateDayChip(binding.chipDayTue, activeDaysSet.contains("tuesday"))
            updateDayChip(binding.chipDayWed, activeDaysSet.contains("wednesday"))
            updateDayChip(binding.chipDayThu, activeDaysSet.contains("thursday"))
            updateDayChip(binding.chipDayFri, activeDaysSet.contains("friday"))
            updateDayChip(binding.chipDaySat, activeDaysSet.contains("saturday"))
            updateDayChip(binding.chipDaySun, activeDaysSet.contains("sunday"))

            if (isQuietActive) {
                binding.textQuietHoursBadge.text = getString(R.string.quiet_hours_in_effect_badge)
                binding.textQuietHoursBadge.setTextColor(ContextCompat.getColor(this, android.R.color.white))
                binding.textQuietHoursBadge.backgroundTintList = ContextCompat.getColorStateList(this, R.color.status_purple)
                binding.textQuietHoursBadge.visibility = View.VISIBLE

                binding.layoutQuietHoursActiveNowBanner.visibility = View.VISIBLE
            } else {
                binding.textQuietHoursBadge.text = getString(R.string.quiet_hours_scheduled_badge)
                binding.textQuietHoursBadge.setTextColor(ContextCompat.getColor(this, android.R.color.white))
                binding.textQuietHoursBadge.backgroundTintList = ContextCompat.getColorStateList(this, R.color.status_yellow)
                binding.textQuietHoursBadge.visibility = View.VISIBLE

                binding.layoutQuietHoursActiveNowBanner.visibility = View.GONE
            }
        } else {
            binding.containerQuietHoursDetails.visibility = View.GONE
            binding.layoutQuietHoursActiveNowBanner.visibility = View.GONE

            binding.textQuietHoursBadge.text = getString(R.string.quiet_hours_disabled_badge)
            binding.textQuietHoursBadge.setTextColor(ContextCompat.getColor(this, R.color.text_secondary))
            binding.textQuietHoursBadge.backgroundTintList = ContextCompat.getColorStateList(this, R.color.border)
            binding.textQuietHoursBadge.visibility = View.VISIBLE

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
        val totalSec = usage?.totalScreenTimeSeconds ?: 0L
        binding.containerAppUsageList.removeAllViews()

        if (usage != null && !usage.permissionGranted) {
            binding.textEmptyApps.text = getString(R.string.apps_unavailable_no_perm)
            binding.textEmptyApps.visibility = View.VISIBLE
            binding.textAppUsageCountBadge.visibility = View.GONE
        } else if (appList.isEmpty()) {
            binding.textEmptyApps.text = getString(R.string.no_apps_recorded)
            binding.textEmptyApps.visibility = View.VISIBLE
            binding.textAppUsageCountBadge.visibility = View.GONE
        } else {
            val totalAppOpens = appList.sumOf { it.openCount }
            val isTiming = activeMetric == "screenTime"
            val runApps = appList.filter { it.durationSeconds > 0 }.sortedByDescending { it.durationSeconds }
            val openedApps = appList.filter { it.openCount > 0 }.sortedByDescending { it.openCount }

            if (isTiming) {
                binding.cardScreenTimeSummary.strokeColor = ContextCompat.getColor(this, R.color.accent)
                binding.cardScreenTimeSummary.strokeWidth = dp(2)
                binding.cardMetricMobilePickups.strokeColor = ContextCompat.getColor(this, R.color.border)
                binding.cardMetricMobilePickups.strokeWidth = dp(1)
                binding.cardMetricAppLaunches.strokeColor = ContextCompat.getColor(this, R.color.border)
                binding.cardMetricAppLaunches.strokeWidth = dp(1)

                binding.textBadgeScreenTime.text = "Timing"
                binding.textBadgeScreenTime.background = ContextCompat.getDrawable(this, R.drawable.bg_badge_pill_success)
                binding.textBadgeScreenTime.setTextColor(ContextCompat.getColor(this, R.color.status_green_dark))
                binding.textBadgeMobilePickups.visibility = View.GONE
                binding.textBadgeAppLaunches.visibility = View.GONE

                binding.btnFilterTiming.background = ContextCompat.getDrawable(this, R.drawable.bg_tab_active_pill)
                binding.btnFilterTiming.setTextColor(ContextCompat.getColor(this, R.color.accent_dark))
                binding.btnFilterAppOpens.background = null
                binding.btnFilterAppOpens.setTextColor(ContextCompat.getColor(this, R.color.text_secondary))

                binding.textAppUsageTitle.text = getString(R.string.top_apps_title)
                binding.textAppUsageSubtitle.text = getString(R.string.top_apps_subtitle)
                binding.textAppUsageSubtitle.visibility = View.VISIBLE
                binding.textAppUsageCountBadge.text = "${runApps.size} apps run"
                binding.textAppUsageCountBadge.setTextColor(ContextCompat.getColor(this, R.color.accent_dark))
                binding.textAppUsageCountBadge.visibility = View.VISIBLE
                binding.textScreenTimeActiveApps.text = "${runApps.size} apps today"

                val displayList = runApps.take(30)
                if (displayList.isEmpty()) {
                    binding.textEmptyApps.text = "No app activity today."
                    binding.textEmptyApps.visibility = View.VISIBLE
                } else {
                    binding.textEmptyApps.visibility = View.GONE
                    for ((index, app) in displayList.withIndex()) {
                        val rowView = createAppUsageRow(
                            app = app,
                            totalSec = totalSec,
                            totalAppOpens = totalAppOpens,
                            mode = "screenTime",
                            showDivider = (index < displayList.size - 1)
                        )
                        binding.containerAppUsageList.addView(rowView)
                    }
                }
            } else {
                binding.cardScreenTimeSummary.strokeColor = ContextCompat.getColor(this, R.color.border)
                binding.cardScreenTimeSummary.strokeWidth = dp(1)
                binding.cardMetricMobilePickups.strokeColor = ContextCompat.getColor(this, R.color.status_purple)
                binding.cardMetricMobilePickups.strokeWidth = dp(2)
                binding.cardMetricAppLaunches.strokeColor = ContextCompat.getColor(this, R.color.status_purple)
                binding.cardMetricAppLaunches.strokeWidth = dp(2)

                binding.textBadgeScreenTime.text = "Timing →"
                binding.textBadgeScreenTime.background = ContextCompat.getDrawable(this, R.drawable.bg_badge_pill)
                binding.textBadgeScreenTime.setTextColor(ContextCompat.getColor(this, R.color.text_secondary))
                binding.textBadgeMobilePickups.visibility = View.GONE
                binding.textBadgeAppLaunches.visibility = View.GONE

                binding.btnFilterTiming.background = null
                binding.btnFilterTiming.setTextColor(ContextCompat.getColor(this, R.color.text_secondary))
                binding.btnFilterAppOpens.background = ContextCompat.getDrawable(this, R.drawable.bg_tab_active_pill)
                binding.btnFilterAppOpens.setTextColor(ContextCompat.getColor(this, R.color.status_purple))

                binding.textAppUsageTitle.text = "App Opens Breakdown"
                binding.textAppUsageSubtitle.text = "Showing total open count for each application"
                binding.textAppUsageSubtitle.visibility = View.VISIBLE
                binding.textAppUsageCountBadge.text = "${openedApps.size} apps opened"
                binding.textAppUsageCountBadge.setTextColor(ContextCompat.getColor(this, R.color.status_purple))
                binding.textAppUsageCountBadge.visibility = View.VISIBLE
                binding.textScreenTimeActiveApps.text = "${openedApps.size} apps today"

                val displayList = openedApps.take(30)
                if (displayList.isEmpty()) {
                    binding.textEmptyApps.text = "No app launches today."
                    binding.textEmptyApps.visibility = View.VISIBLE
                } else {
                    binding.textEmptyApps.visibility = View.GONE
                    for ((index, app) in displayList.withIndex()) {
                        val rowView = createAppUsageRow(
                            app = app,
                            totalSec = totalSec,
                            totalAppOpens = totalAppOpens,
                            mode = "appOpens",
                            showDivider = (index < displayList.size - 1)
                        )
                        binding.containerAppUsageList.addView(rowView)
                    }
                }
            }
        }
    }

    private fun createAppUsageRow(
        app: AppUsageItemDto,
        totalSec: Long,
        totalAppOpens: Int,
        mode: String,
        showDivider: Boolean
    ): View {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            setPadding(0, dp(8), 0, if (showDivider) dp(8) else dp(2))
        }

        // Header row with Name and Tag (Duration or Frequency)
        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        val cleanAppName = com.kidsguard.child.util.AppDisplayNames.formatAppDisplayName(app.appName, app.packageName)
        val nameView = TextView(this).apply {
            text = cleanAppName
            textSize = 13.5f
            setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_primary))
            typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL)
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerRow.addView(nameView)

        val percent: Int
        val tagView = TextView(this).apply {
            textSize = 12f
            typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }

        if (mode == "appOpens") {
            val opens = app.openCount
            percent = if (totalAppOpens > 0) {
                Math.round((opens.toDouble() / totalAppOpens) * 100).toInt()
            } else 0
            tagView.text = "$opens opens"
            tagView.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.status_purple))
        } else {
            val durationSec = app.durationSeconds
            percent = if (totalSec > 0) {
                Math.round((durationSec.toDouble() / totalSec) * 100).toInt()
            } else 0
            val hours = durationSec / 3600
            val minutes = (durationSec % 3600) / 60
            val durationStr = when {
                hours > 0 -> "${hours}h ${minutes}m"
                minutes > 0 -> "${minutes}m"
                else -> "< 1m"
            }
            tagView.text = durationStr
            tagView.setTextColor(ContextCompat.getColor(this@MainActivity, R.color.accent_dark))
        }
        headerRow.addView(tagView)
        container.addView(headerRow)

        // Horizontal Progress Bar matching web dashboard gradient
        val progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = false
            max = 100
            progress = percent.coerceIn(2, 100)
            progressDrawable = ContextCompat.getDrawable(
                this@MainActivity,
                if (mode == "appOpens") R.drawable.bg_progress_opens else R.drawable.bg_progress_usage
            )
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(6)
            ).apply {
                topMargin = dp(6)
            }
        }
        container.addView(progressBar)

        if (showDivider) {
            val divider = View(this).apply {
                setBackgroundColor(ContextCompat.getColor(this@MainActivity, R.color.surface_variant))
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    dp(1)
                ).apply {
                    topMargin = dp(10)
                }
            }
            container.addView(divider)
        }

        return container
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
                binding.textTab0AppRestrictionsBadge.background = ContextCompat.getDrawable(this, R.drawable.bg_badge_pill_success)
                binding.textTab0AppRestrictionsBadge.setTextColor(ContextCompat.getColor(this, android.R.color.white))
                binding.textAppRestrictionsAlertBody.text = getString(R.string.app_restrictions_active_body, count)
                binding.btnEnableAppBlocking.visibility = View.GONE
            } else {
                binding.textTab0AppRestrictionsBadge.text = getString(R.string.accessibility_disabled_badge)
                binding.textTab0AppRestrictionsBadge.background = ContextCompat.getDrawable(this, R.drawable.bg_badge_pill_danger)
                binding.textTab0AppRestrictionsBadge.setTextColor(ContextCompat.getColor(this, android.R.color.white))
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

        val cleanName = com.kidsguard.child.util.AppDisplayNames.formatAppDisplayName(blockedApp.appName, blockedApp.packageName)
        val nameView = TextView(this).apply {
            text = "🚫 $cleanName"
            textSize = 14f
            setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_primary))
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }
        infoLayout.addView(nameView)

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
            binding.cardQuietHoursActiveAlert.strokeColor = ContextCompat.getColor(this, R.color.status_purple)
            val formattedTime = "${formatTime12Hour(policy.quietHoursStart)} – ${formatTime12Hour(policy.quietHoursEnd)}"
            val activeDays = formatActiveDays(policy.quietHoursDays)
            binding.textQuietHoursActiveTime.text = "$formattedTime • $activeDays"
        } else {
            binding.cardQuietHoursActiveAlert.visibility = View.GONE
        }
    }

    private fun updateDayChip(chip: TextView, isActive: Boolean) {
        if (isActive) {
            chip.setBackgroundResource(R.drawable.bg_day_pill_active)
            chip.setTextColor(ContextCompat.getColor(this, android.R.color.white))
        } else {
            chip.setBackgroundResource(R.drawable.bg_day_pill_inactive)
            chip.setTextColor(ContextCompat.getColor(this, R.color.text_secondary))
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

        val usedMinutes = ScreenTimeLimitManager.computeUsedMinutesForLimit(this, policy, usage)
        val formattedBudget = formatMinutesHuman(dailyLimitMin)
        val formattedUsed = formatMinutesHuman(usedMinutes)
        val percent = ((usedMinutes.toDouble() / dailyLimitMin) * 100).toInt().coerceIn(0, 100)

        binding.cardDailyLimitAlert.visibility = View.VISIBLE
        binding.progressDailyLimitAlert.progress = percent

        val isLocked = ScreenTimeLimitManager.isLockedForToday(this)
        val isExtActive = ScreenTimeLimitManager.isExtensionActive(this)

        if (isLocked) {
            binding.cardDailyLimitAlert.strokeColor = ContextCompat.getColor(this, R.color.status_red)
            binding.layoutDailyLimitAlertBg.setBackgroundColor(ContextCompat.getColor(this, R.color.status_red_light))
            binding.textDailyLimitAlertTitle.text = getString(R.string.time_over_locked_title)
            binding.textDailyLimitAlertTitle.setTextColor(ContextCompat.getColor(this, R.color.status_red))

            binding.textDailyLimitAlertBadge.text = "LOCKED TODAY"
            binding.textDailyLimitAlertBadge.setTextColor(ContextCompat.getColor(this, android.R.color.white))
            binding.textDailyLimitAlertBadge.backgroundTintList = ContextCompat.getColorStateList(this, R.color.status_red)

            binding.textDailyLimitAlertBody.text = getString(R.string.time_over_locked_body)
            binding.progressDailyLimitAlert.progressTintList = ContextCompat.getColorStateList(this, R.color.status_red)
            binding.progressDailyLimitAlert.progress = 100
            return
        }

        if (usedMinutes >= dailyLimitMin) {
            // Limit reached or exceeded
            binding.cardDailyLimitAlert.strokeColor = ContextCompat.getColor(this, R.color.status_red)
            binding.layoutDailyLimitAlertBg.setBackgroundColor(ContextCompat.getColor(this, R.color.status_red_light))
            binding.textDailyLimitAlertTitle.text = getString(R.string.daily_limit_reached_title)
            binding.textDailyLimitAlertTitle.setTextColor(ContextCompat.getColor(this, R.color.status_red))

            if (isExtActive) {
                binding.textDailyLimitAlertBadge.text = "+5M EXTENSION ACTIVE"
                binding.textDailyLimitAlertBadge.setTextColor(ContextCompat.getColor(this, android.R.color.white))
                binding.textDailyLimitAlertBadge.backgroundTintList = ContextCompat.getColorStateList(this, R.color.status_yellow)
            } else {
                binding.textDailyLimitAlertBadge.text = getString(R.string.daily_limit_reached_badge)
                binding.textDailyLimitAlertBadge.setTextColor(ContextCompat.getColor(this, android.R.color.white))
                binding.textDailyLimitAlertBadge.backgroundTintList = ContextCompat.getColorStateList(this, R.color.status_red)
            }

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
            binding.textDailyLimitAlertBadge.setTextColor(ContextCompat.getColor(this, android.R.color.white))
            binding.textDailyLimitAlertBadge.backgroundTintList = ContextCompat.getColorStateList(this, R.color.status_yellow)

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
            binding.textDailyLimitAlertBadge.setTextColor(ContextCompat.getColor(this, android.R.color.white))
            binding.textDailyLimitAlertBadge.backgroundTintList = ContextCompat.getColorStateList(this, R.color.accent)

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
            return ScreenTimeLimitManager.parseHourMinute(timeStr)
        }

        fun isQuietHoursCurrentlyActive(
            policy: DevicePolicyResponse?,
            now: Calendar = Calendar.getInstance()
        ): Boolean {
            return ScreenTimeLimitManager.isQuietHoursActive(policy, now)
        }

        fun formatTime12Hour(time24: String?): String {
            return ScreenTimeLimitManager.formatTime12Hour(time24)
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
            tabSettings: String
        ): List<String> {
            val tabs = mutableListOf(tabDevice, tabScreenTime)
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

        fun formatRealTime(timeMs: Long = System.currentTimeMillis()): String {
            val timeFormat = SimpleDateFormat("h:mm a", Locale.US)
            return "Real Time: " + timeFormat.format(Date(timeMs))
        }
    }
}
