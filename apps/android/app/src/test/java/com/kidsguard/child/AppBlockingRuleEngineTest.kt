package com.kidsguard.child

import com.kidsguard.child.data.model.AppRestrictionsDto
import com.kidsguard.child.data.model.BlockedAppDto
import com.kidsguard.child.data.model.DevicePolicyResponse
import com.kidsguard.child.domain.rules.AppBlockingRuleEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AppBlockingRuleEngineTest {

    private fun createPolicy(
        enabled: Boolean,
        blockedApps: List<BlockedAppDto>
    ): DevicePolicyResponse {
        return DevicePolicyResponse.defaultPolicy().copy(
            appRestrictions = AppRestrictionsDto(
                enabled = enabled,
                blockedApps = blockedApps
            )
        )
    }

    @Test
    fun isPackageBlocked_returnsFalse_whenPolicyIsNull() {
        assertFalse(AppBlockingRuleEngine.isPackageBlocked("com.google.android.apps.youtube.music", null))
    }

    @Test
    fun isPackageBlocked_returnsFalse_whenRestrictionsDisabled() {
        val policy = createPolicy(
            enabled = false,
            blockedApps = listOf(
                BlockedAppDto(packageName = "com.google.android.apps.youtube.music", appName = "YT Music")
            )
        )
        assertFalse(AppBlockingRuleEngine.isPackageBlocked("com.google.android.apps.youtube.music", policy))
    }

    @Test
    fun isPackageBlocked_returnsFalse_forSystemPackages() {
        val policy = createPolicy(
            enabled = true,
            blockedApps = listOf(
                BlockedAppDto(packageName = "com.android.systemui", appName = "System UI"),
                BlockedAppDto(packageName = "com.kidsguard.child", appName = "KidsGuard")
            )
        )
        assertFalse(AppBlockingRuleEngine.isPackageBlocked("com.android.systemui", policy))
        assertFalse(AppBlockingRuleEngine.isPackageBlocked("com.kidsguard.child", policy))
        assertFalse(AppBlockingRuleEngine.isPackageBlocked("com.google.android.apps.nexuslauncher", policy))
    }

    @Test
    fun isPackageBlocked_matchesExactPackage() {
        val policy = createPolicy(
            enabled = true,
            blockedApps = listOf(
                BlockedAppDto(packageName = "com.google.android.apps.youtube.music", appName = "YT Music")
            )
        )
        assertTrue(AppBlockingRuleEngine.isPackageBlocked("com.google.android.apps.youtube.music", policy))
        val blocked = AppBlockingRuleEngine.findBlockedApp("com.google.android.apps.youtube.music", policy)
        assertNotNull(blocked)
        assertEquals("YT Music", blocked?.appName)
    }

    @Test
    fun isPackageBlocked_matchesKnownAliasWhenPackageIsCustomSlug() {
        // Parent entered 'YT Music', web resolved it to 'app.yt.music'
        val policy = createPolicy(
            enabled = true,
            blockedApps = listOf(
                BlockedAppDto(packageName = "app.yt.music", appName = "YT Music")
            )
        )
        // Foreground Android package is real Google YT Music package
        assertTrue(AppBlockingRuleEngine.isPackageBlocked("com.google.android.apps.youtube.music", policy))
    }

    @Test
    fun isPackageBlocked_matchesPlayStoreAndYouTube() {
        val policy = createPolicy(
            enabled = true,
            blockedApps = listOf(
                BlockedAppDto(packageName = "app.app.store", appName = "App Store"),
                BlockedAppDto(packageName = "com.google.android.youtube", appName = "YouTube")
            )
        )
        assertTrue(AppBlockingRuleEngine.isPackageBlocked("com.android.vending", policy))
        assertTrue(AppBlockingRuleEngine.isPackageBlocked("com.google.android.youtube", policy))
        assertFalse(AppBlockingRuleEngine.isPackageBlocked("com.calculator", policy))
    }
}
