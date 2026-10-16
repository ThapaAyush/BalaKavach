package com.kidsguard.child

import com.kidsguard.child.domain.rules.DomainRuleEngine
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DomainRuleEngineTest {

    @Test
    fun `matchesBlockedDomain matches exact domain and subdomains`() {
        assertTrue(DomainRuleEngine.matchesBlockedDomain("https://example.com/page", "example.com"))
        assertTrue(DomainRuleEngine.matchesBlockedDomain("http://sub.example.com", "example.com"))
        assertTrue(DomainRuleEngine.matchesBlockedDomain("https://deep.sub.example.com/foo/bar", "example.com"))

        assertFalse(DomainRuleEngine.matchesBlockedDomain("https://notexample.com", "example.com"))
        assertFalse(DomainRuleEngine.matchesBlockedDomain("https://anotherexample.com", "example.com"))
        assertFalse(DomainRuleEngine.matchesBlockedDomain("https://example.org", "example.com"))
    }

    @Test
    fun `matchesBlockedDomain rejects non-HTTP and malformed URLs`() {
        assertFalse(DomainRuleEngine.matchesBlockedDomain("ftp://example.com", "example.com"))
        assertFalse(DomainRuleEngine.matchesBlockedDomain("file:///path/to/file", "example.com"))
        assertFalse(DomainRuleEngine.matchesBlockedDomain("not a valid url", "example.com"))
        assertFalse(DomainRuleEngine.matchesBlockedDomain("", "example.com"))
        assertFalse(DomainRuleEngine.matchesBlockedDomain(null, "example.com"))
    }

    @Test
    fun `isUrlBlocked and isHostBlocked check collections accurately`() {
        val blocked = listOf("badsite.com", "restricted.org")

        assertTrue(DomainRuleEngine.isUrlBlocked("https://badsite.com/login", blocked))
        assertTrue(DomainRuleEngine.isUrlBlocked("http://portal.restricted.org/", blocked))
        assertFalse(DomainRuleEngine.isUrlBlocked("https://goodsite.com", blocked))

        assertTrue(DomainRuleEngine.isHostBlocked("badsite.com", blocked))
        assertTrue(DomainRuleEngine.isHostBlocked("sub.badsite.com", blocked))
        assertFalse(DomainRuleEngine.isHostBlocked("goodsite.com", blocked))
    }
}
