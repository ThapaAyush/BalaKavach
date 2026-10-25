package com.kidsguard.child

import com.kidsguard.child.domain.rules.AdultContentDetector
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AdultContentDetectorTest {

    @Test
    fun detectsCuratedAdultDomains() {
        assertTrue(AdultContentDetector.isAdultContent("https://www.pornhub.com/video/123"))
        assertTrue(AdultContentDetector.isAdultContent("xvideos.com"))
        assertTrue(AdultContentDetector.isAdultContent("https://xnxx.com/search/test"))
        assertTrue(AdultContentDetector.isAdultContent("chaturbate.com/room/abc"))
        assertTrue(AdultContentDetector.isAdultContent("onlyfans.com/model"))
        assertTrue(AdultContentDetector.isAdultContent("m.stripchat.com"))
    }

    @Test
    fun detectsExplicitSearchQueries() {
        assertTrue(AdultContentDetector.isAdultContent("https://www.google.com/search?q=free+porn+videos"))
        assertTrue(AdultContentDetector.isAdultContent("bing.com/search?q=xxx+movies"))
        assertTrue(AdultContentDetector.isAdultContent("hentai watch online"))
    }

    @Test
    fun detectsCustomBlockedDomains() {
        val custom = listOf("gambling-site.com", "bad-games.net")
        assertTrue(AdultContentDetector.isAdultContent("https://gambling-site.com/play", custom))
        assertTrue(AdultContentDetector.isAdultContent("bad-games.net/login", custom))
    }

    @Test
    fun allowsBenignAndEducationalSites() {
        assertFalse(AdultContentDetector.isAdultContent("https://en.wikipedia.org/wiki/Science"))
        assertFalse(AdultContentDetector.isAdultContent("https://kids.nationalgeographic.com/"))
        assertFalse(AdultContentDetector.isAdultContent("https://www.google.com/search?q=math+homework+help"))
        assertFalse(AdultContentDetector.isAdultContent("https://www.youtube.com/watch?v=abc123xyz"))
        assertFalse(AdultContentDetector.isAdultContent("https://khanacademy.org"))
        assertFalse(AdultContentDetector.isAdultContent(""))
        assertFalse(AdultContentDetector.isAdultContent(null))
    }

    @Test
    fun identifiesBrowserPackages() {
        assertTrue(AdultContentDetector.isBrowserPackage("com.android.chrome"))
        assertTrue(AdultContentDetector.isBrowserPackage("com.chrome.beta"))
        assertTrue(AdultContentDetector.isBrowserPackage("com.sec.android.app.sbrowser"))
        assertTrue(AdultContentDetector.isBrowserPackage("com.brave.browser"))
        assertTrue(AdultContentDetector.isBrowserPackage("org.mozilla.firefox"))
        assertFalse(AdultContentDetector.isBrowserPackage("com.whatsapp"))
        assertFalse(AdultContentDetector.isBrowserPackage("com.google.android.youtube"))
    }
}
