package com.kidsguard.child.domain.rules

import java.net.URI
import java.util.Locale

/**
 * Matching engine for checking whether a URL or host matches configured blocked domains.
 */
object DomainRuleEngine {

    /**
     * Checks if a URL matches a specific blocked domain.
     * Matches exact hostname or any subdomain (e.g. sub.example.com matches example.com).
     */
    fun matchesBlockedDomain(urlValue: String?, domainValue: String?): Boolean {
        if (urlValue.isNullOrBlank() || domainValue.isNullOrBlank()) return false

        val uri: URI = try {
            URI(urlValue)
        } catch (_: Exception) {
            return false
        }

        val scheme = uri.scheme?.lowercase(Locale.ROOT)
        if (scheme != "http" && scheme != "https") return false

        val host = uri.host?.lowercase(Locale.ROOT)?.trimEnd('.') ?: return false

        val normalizedDomain = try {
            DomainNormalizer.normalizeDomainInput(domainValue)
        } catch (_: Exception) {
            return false
        }

        return host == normalizedDomain || host.endsWith(".$normalizedDomain")
    }

    /**
     * Checks if a URL matches any domain in the collection of blocked domains.
     */
    fun isUrlBlocked(urlValue: String?, blockedDomains: Collection<String>): Boolean {
        if (urlValue.isNullOrBlank() || blockedDomains.isEmpty()) return false
        for (domain in blockedDomains) {
            if (matchesBlockedDomain(urlValue, domain)) {
                return true
            }
        }
        return false
    }

    /**
     * Checks if a raw hostname matches any domain in the collection of blocked domains.
     * Useful for DNS-level or packet-level filtering.
     */
    fun isHostBlocked(host: String?, blockedDomains: Collection<String>): Boolean {
        if (host.isNullOrBlank() || blockedDomains.isEmpty()) return false
        val cleanHost = host.lowercase(Locale.ROOT).trimEnd('.')
        for (domain in blockedDomains) {
            val normalized = try {
                DomainNormalizer.normalizeDomainInput(domain)
            } catch (_: Exception) {
                continue
            }
            if (cleanHost == normalized || cleanHost.endsWith(".$normalized")) {
                return true
            }
        }
        return false
    }
}
