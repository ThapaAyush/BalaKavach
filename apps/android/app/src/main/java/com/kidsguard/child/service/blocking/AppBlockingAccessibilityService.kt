package com.kidsguard.child.service.blocking

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.view.accessibility.AccessibilityEvent
import com.kidsguard.child.KidsGuardApp
import com.kidsguard.child.data.local.FilePolicyStorage
import com.kidsguard.child.domain.rules.AppBlockingRuleEngine
import com.kidsguard.child.domain.rules.ScreenTimeLimitManager
import com.kidsguard.child.ui.AppBlockedActivity
import com.kidsguard.child.ui.ScreenTimeOverActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Android Accessibility Service that supervises application usage:
 * 1. Enforces Quiet Hours / Bedtime: Locks all apps and websites in between quiet hours,
 *    redirects to the home screen, and displays the quiet hours restriction screen.
 * 2. Enforces Daily Screen-Time Limits with reminder popups and +5 min snooze.
 * 3. Enforces individual parental application blocking rules without VPN diversion.
 */
class AppBlockingAccessibilityService : AccessibilityService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var monitorJob: Job? = null

    private var currentForegroundPackage: String? = null
    private var lastForegroundTimestamp: Long = 0L
    private var lastBlockedPackage: String? = null
    private var lastBlockedTimestamp: Long = 0L

    override fun onServiceConnected() {
        super.onServiceConnected()
        startPeriodicScreenTimeMonitor()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            return
        }

        val packageName = event.packageName?.toString() ?: return
        val now = System.currentTimeMillis()

        // Track foreground transitions to maintain live usage seconds and open counts
        if (packageName != currentForegroundPackage) {
            if (currentForegroundPackage != null && lastForegroundTimestamp > 0L) {
                val elapsedSec = ((now - lastForegroundTimestamp) / 1000L).coerceAtLeast(0L)
                if (elapsedSec > 0 && !AppBlockingRuleEngine.isExempt(currentForegroundPackage!!)) {
                    ScreenTimeLimitManager.addLiveForegroundSeconds(this, elapsedSec, now)
                }
            }
            if (!AppBlockingRuleEngine.isExempt(packageName)) {
                ScreenTimeLimitManager.recordAppOpen(this, packageName, now)
                ScreenTimeLimitManager.recordDeviceUnlock(this, now)
            }
            currentForegroundPackage = packageName
            lastForegroundTimestamp = now
        }

        // 1. Never block our own companion app
        if (packageName == applicationContext.packageName ||
            packageName == "com.kidsguard.child" ||
            packageName == "com.kidsguard.child.debug"
        ) {
            return
        }

        val policy = (applicationContext as? KidsGuardApp)?.localPolicyStorage?.getCachedPolicy()
            ?: FilePolicyStorage(applicationContext).getCachedPolicy()

        // Launcher (home screen) and emergency dialer remain accessible so phone is not bricked
        val isLauncher = AppBlockingRuleEngine.isExempt(packageName) && packageName.contains("launcher")
        val isDialer = packageName.contains("dialer") || packageName.contains("phone")

        if (isLauncher || isDialer) {
            return
        }

        // 2. Check Quiet Hours / Bedtime Window (Parent configured active time window)
        val isQuietHours = ScreenTimeLimitManager.isQuietHoursActive(policy)
        if (isQuietHours) {
            if (packageName != lastBlockedPackage || (now - lastBlockedTimestamp) > 1500L) {
                lastBlockedPackage = packageName
                lastBlockedTimestamp = now

                val friendlyName = resolveAppLabel(packageName)
                val windowStr = ScreenTimeLimitManager.formatQuietHoursWindow(
                    policy?.quietHoursStart,
                    policy?.quietHoursEnd
                )

                val blockIntent = Intent(this, AppBlockedActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    putExtra(AppBlockedActivity.EXTRA_PACKAGE_NAME, packageName)
                    putExtra(AppBlockedActivity.EXTRA_APP_NAME, friendlyName)
                    putExtra(AppBlockedActivity.EXTRA_BLOCK_TYPE, AppBlockedActivity.BLOCK_TYPE_QUIET_HOURS)
                    putExtra(AppBlockedActivity.EXTRA_TIME_WINDOW, windowStr)
                }
                startActivity(blockIntent)
            }
            return
        }

        val usage = (applicationContext as? KidsGuardApp)?.usageStatsReader?.measureTodayUsage()

        // 3. Check Daily Screen-Time Limit and Device Lockout
        val isLocked = ScreenTimeLimitManager.isLockedForToday(this, now)
        val screenTimeState = ScreenTimeLimitManager.checkScreenTime(this, policy, usage, now)

        if (isLocked || screenTimeState.isTimeOver) {
            if (packageName != lastBlockedPackage || (now - lastBlockedTimestamp) > 1500L) {
                lastBlockedPackage = packageName
                lastBlockedTimestamp = now

                val overIntent = Intent(this, ScreenTimeOverActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    putExtra(ScreenTimeOverActivity.EXTRA_BUDGET_MINUTES, policy?.dailyLimitMinutes ?: 0)
                    putExtra(ScreenTimeOverActivity.EXTRA_USED_MINUTES, screenTimeState.usedMinutes.coerceAtLeast(policy?.dailyLimitMinutes ?: 0))
                    putExtra(ScreenTimeOverActivity.EXTRA_IS_LOCKED_MODE, isLocked)
                }
                startActivity(overIntent)
            }
            return
        }

        // 4. Check individual parent-restricted apps (when quiet hours and daily limit not in effect)
        if (AppBlockingRuleEngine.isExempt(packageName)) {
            return
        }

        if (packageName == lastBlockedPackage && (now - lastBlockedTimestamp) < 1000L) {
            return
        }

        val blockedApp = AppBlockingRuleEngine.findBlockedApp(packageName, policy)
        if (blockedApp != null) {
            lastBlockedPackage = packageName
            lastBlockedTimestamp = now

            val blockIntent = Intent(this, AppBlockedActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra(AppBlockedActivity.EXTRA_PACKAGE_NAME, packageName)
                putExtra(AppBlockedActivity.EXTRA_APP_NAME, blockedApp.appName.ifBlank { packageName })
                putExtra(AppBlockedActivity.EXTRA_BLOCK_TYPE, AppBlockedActivity.BLOCK_TYPE_APP_RESTRICTION)
            }
            startActivity(blockIntent)
        }
    }

    private fun startPeriodicScreenTimeMonitor() {
        monitorJob?.cancel()
        monitorJob = serviceScope.launch {
            while (isActive) {
                delay(3000L) // Periodic check every 3 seconds
                try {
                    checkAndEnforceScreenTimeLimit()
                } catch (_: Exception) {
                    // Safe guard against loop termination
                }
            }
        }
    }

    private fun checkAndEnforceScreenTimeLimit() {
        val now = System.currentTimeMillis()
        val pkg = currentForegroundPackage ?: return

        // If currently in our own companion app, home launcher, or dialer, do not interrupt
        if (pkg == applicationContext.packageName ||
            pkg.contains("kidsguard") ||
            pkg.contains("launcher") ||
            pkg.contains("dialer")
        ) {
            return
        }

        // Accumulate active foreground duration for currently running app
        if (lastForegroundTimestamp > 0L) {
            val elapsedSec = ((now - lastForegroundTimestamp) / 1000L).coerceAtLeast(0L)
            if (elapsedSec >= 2L && !AppBlockingRuleEngine.isExempt(pkg)) {
                ScreenTimeLimitManager.addLiveForegroundSeconds(this, elapsedSec, now)
                lastForegroundTimestamp = now
            }
        }

        val policy = (applicationContext as? KidsGuardApp)?.localPolicyStorage?.getCachedPolicy()
            ?: FilePolicyStorage(applicationContext).getCachedPolicy()

        // Quiet Hours periodic check: if clock enters quiet hours while child is inside an app
        val isQuietHours = ScreenTimeLimitManager.isQuietHoursActive(policy)
        if (isQuietHours) {
            if (ScreenTimeLimitManager.canShowPopupNow(this, now, cooldownMs = 3500L)) {
                val friendlyName = resolveAppLabel(pkg)
                val windowStr = ScreenTimeLimitManager.formatQuietHoursWindow(
                    policy?.quietHoursStart,
                    policy?.quietHoursEnd
                )
                val blockIntent = Intent(this, AppBlockedActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    putExtra(AppBlockedActivity.EXTRA_PACKAGE_NAME, pkg)
                    putExtra(AppBlockedActivity.EXTRA_APP_NAME, friendlyName)
                    putExtra(AppBlockedActivity.EXTRA_BLOCK_TYPE, AppBlockedActivity.BLOCK_TYPE_QUIET_HOURS)
                    putExtra(AppBlockedActivity.EXTRA_TIME_WINDOW, windowStr)
                }
                startActivity(blockIntent)
            }
            return
        }

        val isLocked = ScreenTimeLimitManager.isLockedForToday(this, now)
        val usage = (applicationContext as? KidsGuardApp)?.usageStatsReader?.measureTodayUsage()
        val screenTimeState = ScreenTimeLimitManager.checkScreenTime(this, policy, usage, now)

        if (isLocked || screenTimeState.isTimeOver) {
            if (ScreenTimeLimitManager.canShowPopupNow(this, now, cooldownMs = 3500L)) {
                val overIntent = Intent(this, ScreenTimeOverActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    putExtra(ScreenTimeOverActivity.EXTRA_BUDGET_MINUTES, policy?.dailyLimitMinutes ?: 0)
                    putExtra(ScreenTimeOverActivity.EXTRA_USED_MINUTES, screenTimeState.usedMinutes.coerceAtLeast(policy?.dailyLimitMinutes ?: 0))
                    putExtra(ScreenTimeOverActivity.EXTRA_IS_LOCKED_MODE, isLocked)
                }
                startActivity(overIntent)
            }
        }
    }

    private fun resolveAppLabel(pkg: String): String {
        return try {
            val appInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                packageManager.getApplicationInfo(pkg, PackageManager.ApplicationInfoFlags.of(0))
            } else {
                @Suppress("DEPRECATION")
                packageManager.getApplicationInfo(pkg, 0)
            }
            packageManager.getApplicationLabel(appInfo).toString()
        } catch (_: Exception) {
            pkg
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }

    override fun onInterrupt() {
        // Service interrupted by system
    }
}
