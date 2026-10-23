package com.kidsguard.child.util

import java.util.Locale

object AppDisplayNames {

    private val KNOWN_APP_DISPLAY_NAMES = mapOf(
        "com.whatsapp" to "WhatsApp",
        "com.whatsapp.w4b" to "WhatsApp Business",
        "com.pw.pwtalk" to "PW Talk",
        "com.app.media.rgm" to "RGM Media",
        "com.google.android.apps.photos" to "Google Photos",
        "com.google.android.apps.maps" to "Google Maps",
        "com.google.android.apps.docs" to "Google Docs",
        "com.google.android.youtube" to "YouTube",
        "com.google.android.apps.youtube.music" to "YouTube Music",
        "com.google.android.gm" to "Gmail",
        "com.google.android.googlequicksearchbox" to "Google",
        "com.google.android.apps.nbu.paisa.user" to "Google Pay",
        "com.google.android.calendar" to "Google Calendar",
        "com.google.android.contacts" to "Contacts",
        "com.google.android.dialer" to "Phone",
        "com.google.android.apps.messaging" to "Messages",
        "com.android.chrome" to "Chrome",
        "com.android.vending" to "Google Play Store",
        "com.sec.android.app.clockpackage" to "Clock",
        "com.sec.android.app.camera" to "Camera",
        "com.sec.android.app.myfiles" to "My Files",
        "com.sec.android.gallery3d" to "Gallery",
        "com.sec.android.app.launcher" to "One UI Home",
        "com.sec.android.app.sbrowser" to "Samsung Internet",
        "com.sec.android.app.popupcalculator" to "Calculator",
        "com.sec.android.app.voicenote" to "Voice Recorder",
        "com.sec.android.easyMover" to "Smart Switch",
        "com.samsung.android.calendar" to "Samsung Calendar",
        "com.samsung.android.dialer" to "Phone",
        "com.samsung.android.messaging" to "Messages",
        "com.kidsguard.child" to "BalaKavach",
        "com.kidsguard.child.debug" to "BalaKavach",
        "com.instagram.android" to "Instagram",
        "com.facebook.katana" to "Facebook",
        "com.facebook.orca" to "Messenger",
        "com.facebook.lite" to "Facebook Lite",
        "com.snapchat.android" to "Snapchat",
        "com.spotify.music" to "Spotify",
        "com.netflix.mediaclient" to "Netflix",
        "com.discord" to "Discord",
        "com.zhiliaoapp.musically" to "TikTok",
        "com.roblox.client" to "Roblox",
        "com.mojang.minecraftpe" to "Minecraft",
        "com.twitter.android" to "X (Twitter)",
        "org.telegram.messenger" to "Telegram",
        "org.telegram.plus" to "Telegram Plus",
        "com.truecaller" to "Truecaller",
        "com.phonepe.app" to "PhonePe",
        "net.one97.paytm" to "Paytm",
        "in.org.npci.upiapp" to "BHIM UPI",
        "com.amazon.mShop.android.shopping" to "Amazon Shopping",
        "com.flipkart.android" to "Flipkart",
        "com.jio.media.jiobeats" to "JioSaavn",
        "com.jio.myjio" to "MyJio",
        "com.hotstar" to "Disney+ Hotstar",
        "in.startv.hotstar" to "Disney+ Hotstar",
        "com.zee5.hibiscus" to "ZEE5",
        "com.sonyliv" to "Sony LIV",
        "com.ubercab" to "Uber",
        "com.olacabs.customer" to "Ola",
        "in.swiggy.android" to "Swiggy",
        "com.application.zomato" to "Zomato",
        "com.duolingo" to "Duolingo",
        "org.khanacademy.android" to "Khan Academy",
        "com.chess" to "Chess.com",
        "com.brave.browser" to "Brave Browser",
        "org.mozilla.firefox" to "Firefox",
        "com.microsoft.emmx" to "Microsoft Edge",
        "com.microsoft.office.officehubrow" to "Microsoft 365"
    )

    fun isPackageName(str: String?): Boolean {
        if (str.isNullOrBlank()) return false
        val s = str.trim()
        if (s.startsWith("com.") || s.startsWith("org.") || s.startsWith("net.") ||
            s.startsWith("io.") || s.startsWith("in.") || s.startsWith("gov.") ||
            s.startsWith("tv.") || s.startsWith("app.") || s.contains(".android.")
        ) {
            return true
        }
        return s.contains(".") && !s.contains(" ") && s.split(".").size >= 3
    }

    fun humanizePackageName(pkg: String?): String {
        if (pkg.isNullOrBlank()) return "Application"
        val cleanPkg = pkg.trim()
        val known = KNOWN_APP_DISPLAY_NAMES[cleanPkg]
        if (known != null) return known

        var p = cleanPkg
        p = p.replace(Regex("^(com|org|net|io|in|gov|tv)\\.", RegexOption.IGNORE_CASE), "")
        p = p.replace(
            Regex("^(google\\.android\\.apps\\.|google\\.android\\.|sec\\.android\\.app\\.|sec\\.android\\.|android\\.apps\\.|android\\.)", RegexOption.IGNORE_CASE),
            ""
        )

        var parts = p.split(".").filter { it.isNotBlank() }
        val filtered = parts.filter {
            it.lowercase(Locale.ROOT) !in listOf("app", "apps", "android", "mobile", "client")
        }
        if (filtered.isNotEmpty()) {
            parts = filtered
        }

        var target = parts.lastOrNull() ?: cleanPkg
        if (parts.size > 1 && parts[0].length <= 3 && !target.lowercase(Locale.ROOT).startsWith(parts[0].lowercase(Locale.ROOT))) {
            target = "${parts[0]} $target"
        }

        target = target.replace(Regex("package$", RegexOption.IGNORE_CASE), "")
        target = target.replace(Regex("([a-z])([A-Z])"), "$1 $2")
        target = target.replace(Regex("[_\\-]+"), " ")

        val words = target.split(Regex("\\s+")).filter { it.isNotBlank() }.map { word ->
            if (word.length <= 3) {
                word.uppercase(Locale.ROOT)
            } else {
                word.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.ROOT) else it.toString() }
            }
        }

        return if (words.isNotEmpty()) words.joinToString(" ") else cleanPkg
    }

    fun formatAppDisplayName(rawName: String?, packageName: String?): String {
        if (!packageName.isNullOrBlank()) {
            val known = KNOWN_APP_DISPLAY_NAMES[packageName.trim()]
            if (known != null) return known
        }
        if (!rawName.isNullOrBlank()) {
            val known = KNOWN_APP_DISPLAY_NAMES[rawName.trim()]
            if (known != null) return known

            val trimmed = rawName.trim()
            if (!isPackageName(trimmed)) {
                return trimmed
            }
        }
        val target = if (!packageName.isNullOrBlank()) packageName else rawName
        return humanizePackageName(target)
    }
}
