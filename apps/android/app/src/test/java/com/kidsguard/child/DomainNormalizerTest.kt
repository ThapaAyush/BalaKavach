package com.kidsguard.child

import com.kidsguard.child.domain.rules.DomainNormalizer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class DomainNormalizerTest {

    @Test
    fun `normalizes bare domains and HTTP(S) origins to lowercase ASCII without trailing dot`() {
        assertEquals("example.com", DomainNormalizer.normalizeDomainInput("example.com"))
        assertEquals("example.com", DomainNormalizer.normalizeDomainInput("EXAMPLE.COM"))
        assertEquals("example.com", DomainNormalizer.normalizeDomainInput("example.com."))
        assertEquals("sub.example.com", DomainNormalizer.normalizeDomainInput("Sub.Example.COM."))
        assertEquals("example.com", DomainNormalizer.normalizeDomainInput("https://example.com"))
        assertEquals("example.com", DomainNormalizer.normalizeDomainInput("http://example.com/"))
        assertEquals("sub.domain.org", DomainNormalizer.normalizeDomainInput("https://sub.domain.org/"))
    }

    @Test
    fun `converts internationalized domain names (IDN) to punycode`() {
        assertEquals("xn--bcher-kva.ch", DomainNormalizer.normalizeDomainInput("bücher.ch"))
    }

    @Test
    fun `rejects invalid inputs, spaces, and control characters`() {
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput(null)
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("")
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("   ")
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("example .com")
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("example\u0000.com")
        }
    }

    @Test
    fun `rejects credentials, ports, paths, queries, and fragments`() {
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("http://user:pass@example.com")
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("user@example.com")
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("http://example.com:8080")
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("example.com:8080")
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("https://example.com/some/path")
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("example.com/path")
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("https://example.com?query=1")
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("example.com#section")
        }
    }

    @Test
    fun `rejects IPv4 addresses and numeric TLDs`() {
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("127.0.0.1")
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("192.168.1.1")
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("8.8.8.8")
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("example.123")
        }
    }

    @Test
    fun `rejects single label domains and invalid label formats`() {
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("localhost")
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("com")
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("-example.com")
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("example-.com")
        }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainInput("ex_ample.com")
        }
    }

    @Test
    fun `normalizes, deduplicates, and limits domain lists`() {
        val input = listOf("example.com", "EXAMPLE.COM.", "sub.example.com", "https://example.com/")
        val result = DomainNormalizer.normalizeDomainList(input)
        assertEquals(listOf("example.com", "sub.example.com"), result)

        val largeList = (1..101).map { "site$it.example.com" }
        assertThrows(IllegalArgumentException::class.java) {
            DomainNormalizer.normalizeDomainList(largeList, maxDomains = 100)
        }
    }
}
