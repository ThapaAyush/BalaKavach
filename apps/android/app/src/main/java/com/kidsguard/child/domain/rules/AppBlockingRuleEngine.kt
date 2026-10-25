package com.kidsguard.child.domain.rules

import com.kidsguard.child.data.model.BlockedAppDto
import com.kidsguard.child.data.model.DevicePolicyResponse

/**
 * Intelligent rule engine to determine whether a foreground Android package/app
 * should be blocked based on the active parent policy.
 *
 * Supports exact package matching, common alias normalization, and app name matching.
 */
object AppBlockingRuleEngine {

    // Critical system packages that must NEVER be blocked
    private val EXEMPT_PACKAGES = setOf(
        "com.kidsguard.child",
        "com.kidsguard.child.debug",
        "android",
        "com.android.systemui",
        "com.google.android.apps.nexuslauncher",
        "com.google.android.apps.nexuslauncher.NexusLauncherActivity",
        "com.android.launcher",
        "com.android.launcher3",
        "com.google.android.inputmethod.latin",
        "com.google.android.dialer",
        "com.android.dialer",
        "com.android.phone",
        "com.android.settings"
    )

    // Common aliases mapping known Android packages to typical web display names and slugs
    private val KNOWN_APP_ALIASES = mapOf(
        "com.google.android.apps.youtube.music" to setOf("yt music", "youtube music", "app.yt.music", "app.youtube.music", "music"),
        "com.google.android.youtube" to setOf("youtube", "app.youtube", "yt"),
        "com.android.vending" to setOf("play store", "google play", "google play store", "app store", "app.play.store", "app.app.store"),
        "com.zhiliaoapp.musically" to setOf("tiktok", "app.tiktok"),
        "com.instagram.android" to setOf("instagram", "app.instagram", "insta"),
        "com.roblox.client" to setOf("roblox", "app.roblox"),
        "com.snapchat.android" to setOf("snapchat", "app.snapchat"),
        "com.discord" to setOf("discord", "app.discord"),
        "com.netflix.mediaclient" to setOf("netflix", "app.netflix"),
        "com.facebook.katana" to setOf("facebook", "app.facebook", "fb"),
        "com.mojang.minecraftpe" to setOf("minecraft", "app.minecraft"),
        "com.whatsapp" to setOf("whatsapp", "app.whatsapp"),
        "com.spotify.music" to setOf("spotify", "app.spotify"),
        "tv.twitch.android.app" to setOf("twitch", "app.twitch"),
        "org.telegram.messenger" to setOf("telegram", "app.telegram"),
        "com.twitter.android" to setOf("twitter", "x", "app.twitter", "app.x"),
        "com.reddit.frontpage" to setOf("reddit", "app.reddit"),
        "com.android.chrome" to setOf("chrome", "google chrome", "app.chrome")
    )

    fun isExempt(packageName: String): Boolean {
        val clean = packageName.lowercase().trim()
        return EXEMPT_PACKAGES.contains(clean) || clean.contains("launcher") || clean.contains("home")
    }

    /**
     * Determines whether the given package is blocked by the policy.
     */
    fun isPackageBlocked(
        packageName: String,
        policy: DevicePolicyResponse?
    ): Boolean {
        return findBlockedApp(packageName, policy) != null
    }

    /**
     * Finds the matched BlockedAppDto if blocked, or null if allowed.
     */
    fun findBlockedApp(
        packageName: String,
        policy: DevicePolicyResponse?
    ): BlockedAppDto? {
        if (policy == null) return null
        val restrictions = policy.appRestrictions
        if (!restrictions.enabled) return null
        if (isExempt(packageName)) return null

        val targetPkg = packageName.lowercase().trim()
        val targetAliases = KNOWN_APP_ALIASES[targetPkg] ?: emptySet()

        for (blocked in restrictions.blockedApps) {
            val bPkg = blocked.packageName.lowercase().trim()
            val bName = blocked.appName.lowercase().trim()

            // 1. Direct package match
            if (targetPkg == bPkg) return blocked

            // 2. Direct name or alias match
            if (targetAliases.contains(bPkg) || targetAliases.contains(bName)) return blocked

            // 3. Substring matching for common aliases
            if (bName.isNotBlank()) {
                if (bName == "yt music" && targetPkg.contains("youtube.music")) return blocked
                if (bName == "youtube" && targetPkg == "com.google.android.youtube") return blocked
                if ((bName == "app store" || bName == "play store") && targetPkg == "com.android.vending") return blocked
            }

            // 4. In case the package slug matches
            if (bPkg.isNotBlank() && bPkg.startsWith("app.")) {
                val slug = bPkg.removePrefix("app.")
                if (slug.isNotBlank() && targetPkg.contains(slug)) return blocked
            }
        }

        return null
    }
}
