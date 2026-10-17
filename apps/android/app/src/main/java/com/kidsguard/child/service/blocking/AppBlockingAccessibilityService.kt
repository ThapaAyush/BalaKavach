package com.kidsguard.child.service.blocking

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent
import com.kidsguard.child.KidsGuardApp
import com.kidsguard.child.data.local.FilePolicyStorage
import com.kidsguard.child.domain.rules.AppBlockingRuleEngine
import com.kidsguard.child.ui.AppBlockedActivity

class AppBlockingAccessibilityService : AccessibilityService() {

    private var lastBlockedPackage: String? = null
    private var lastBlockedTimestamp: Long = 0L

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            return
        }

        val packageName = event.packageName?.toString() ?: return
        if (packageName == applicationContext.packageName || AppBlockingRuleEngine.isExempt(packageName)) {
            return
        }

        val now = System.currentTimeMillis()
        if (packageName == lastBlockedPackage && (now - lastBlockedTimestamp) < 1000L) {
            return
        }

        val policy = (applicationContext as? KidsGuardApp)?.localPolicyStorage?.getCachedPolicy()
            ?: FilePolicyStorage(applicationContext).getCachedPolicy()

        val blockedApp = AppBlockingRuleEngine.findBlockedApp(packageName, policy)
        if (blockedApp != null) {
            lastBlockedPackage = packageName
            lastBlockedTimestamp = now

            // Launch clear explanatory block screen directly over the restricted app
            val blockIntent = Intent(this, AppBlockedActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra(AppBlockedActivity.EXTRA_PACKAGE_NAME, packageName)
                putExtra(AppBlockedActivity.EXTRA_APP_NAME, blockedApp.appName.ifBlank { packageName })
            }
            startActivity(blockIntent)
        }
    }

    override fun onInterrupt() {
        // Service interrupted by system
    }
}
