package com.kidsguard.child.domain.rules

import java.util.Locale

object AdultContentDetector {

    val ADULT_DOMAINS: Set<String> = setOf(
        "adultfriendfinder.com",
        "anyporn.com",
        "badjojo.com",
        "bangbros.com",
        "beeg.com",
        "bongacams.com",
        "brazzers.com",
        "brazzers.network",
        "cam4.com",
        "camsoda.com",
        "chaturbate.com",
        "czechav.com",
        "daftsex.com",
        "drtuber.com",
        "empflix.com",
        "eporner.com",
        "erome.com",
        "fapdu.com",
        "fuq.com",
        "gelbooru.com",
        "heavy-r.com",
        "hentaihaven.xxx",
        "hqporner.com",
        "livejasmin.com",
        "motherless.com",
        "naughtyamerica.com",
        "nhentai.net",
        "onlyfans.com",
        "porn.com",
        "porn555.com",
        "porndig.com",
        "pornhat.com",
        "pornhub.com",
        "pornone.com",
        "redgifs.com",
        "redtube.com",
        "rule34.xxx",
        "sex.com",
        "slutload.com",
        "spankbang.com",
        "stripchat.com",
        "sunporno.com",
        "thumbzilla.com",
        "tnaflix.com",
        "tube18.com",
        "tube8.com",
        "tubegalore.com",
        "twistys.com",
        "upornia.com",
        "voyeurweb.com",
        "xhamster.com",
        "xmoviesforyou.com",
        "xnxx.com",
        "xvideos.com",
        "xxx.com",
        "youjizz.com",
        "youporn.com"
    )

    val ADULT_KEYWORDS: List<String> = listOf(
        "porn",
        "porno",
        "xxx",
        "xvideos",
        "xnxx",
        "xhamster",
        "redtube",
        "pornhub",
        "hentai",
        "stripchat",
        "chaturbate",
        "spankbang",
        "erotic",
        "nsfw",
        "onlyfans",
        "cam4",
        "youporn"
    )

    val BROWSER_PACKAGES: Set<String> = setOf(
        "com.android.chrome",
        "com.chrome.beta",
        "com.chrome.dev",
        "com.chrome.canary",
        "org.chromium.chrome",
        "com.sec.android.app.sbrowser",
        "com.brave.browser",
        "org.mozilla.firefox",
        "com.opera.browser",
        "com.microsoft.emmx"
    )

    /**
     * Determines whether a given text string extracted from a browser URL bar or search field
     * contains adult content, adult domains, adult search terms, or parent-blocked domains.
     */
    fun isAdultContent(
        rawText: String?,
        customBlockedDomains: List<String> = emptyList()
    ): Boolean {
        if (rawText.isNullOrBlank()) return false
        val text = rawText.lowercase(Locale.ROOT).trim()

        // 1. Direct match with curated 18+ adult domains
        for (domain in ADULT_DOMAINS) {
            if (text.contains(domain)) {
                return true
            }
        }

        // 2. Direct match with custom parental blocked domains
        for (custom in customBlockedDomains) {
            val normalized = custom.lowercase(Locale.ROOT).trim()
            if (normalized.isNotBlank() && text.contains(normalized)) {
                return true
            }
        }

        // 3. Explicit adult search query / path detection
        for (keyword in ADULT_KEYWORDS) {
            // Match standalone word or URL path component (e.g. /porn/, q=porn, ?q=xxx)
            val regex = Regex("(^|[^a-z0-9])$keyword([^a-z0-9]|\$)")
            if (regex.containsMatchIn(text)) {
                return true
            }
        }

        return false
    }

    fun isBrowserPackage(packageName: String?): Boolean {
        if (packageName.isNullOrBlank()) return false
        val lower = packageName.lowercase(Locale.ROOT)
        return BROWSER_PACKAGES.contains(lower) || lower.contains("browser") || lower.contains("chrome")
    }
}
