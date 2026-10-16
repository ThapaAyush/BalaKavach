package com.kidsguard.child.domain.rules

import java.net.IDN
import java.net.URI
import java.util.Locale

/**
 * Domain normalization and validation semantics matching KidsGuard Chrome Extension.
 */
object DomainNormalizer {
    const val MAX_BLOCKED_DOMAINS = 100
    private val DOMAIN_LABEL_REGEX = Regex("^(?!-)[a-z0-9-]{1,63}(?<!-)$")
    private val IPV4_REGEX = Regex("^\\d+(?:\\.\\d+){3}$")
    private val ALL_DIGITS_REGEX = Regex("^\\d+$")

    /**
     * Normalizes a bare domain or HTTP(S) origin into canonical lowercase ASCII domain name.
     * Throws IllegalArgumentException on invalid input.
     */
    @Throws(IllegalArgumentException::class)
    fun normalizeDomainInput(input: String?): String {
        if (input == null) {
            throw IllegalArgumentException("Enter a domain name or HTTP(S) origin.")
        }

        val value = input.trim()
        if (value.isEmpty() || value.any { it.isWhitespace() || it.code in 0..31 || it.code == 127 }) {
            throw IllegalArgumentException("Enter a valid domain without spaces or control characters.")
        }

        val hostname: String
        val isHttpOrigin = value.startsWith("http://", ignoreCase = true) || value.startsWith("https://", ignoreCase = true)

        if (isHttpOrigin) {
            val schemeEnd = value.indexOf("://") + 3
            val afterScheme = value.substring(schemeEnd)
            val slashIdx = afterScheme.indexOf('/')
            val qIdx = afterScheme.indexOf('?')
            val hashIdx = afterScheme.indexOf('#')

            var endIdx = afterScheme.length
            if (slashIdx != -1) endIdx = minOf(endIdx, slashIdx)
            if (qIdx != -1) endIdx = minOf(endIdx, qIdx)
            if (hashIdx != -1) endIdx = minOf(endIdx, hashIdx)

            val authority = afterScheme.substring(0, endIdx)
            if (authority.isEmpty() || authority.contains('@') || authority.contains(':') || authority.contains('%') ||
                afterScheme.contains('?') || afterScheme.contains('#')
            ) {
                throw IllegalArgumentException("Use a bare domain or HTTP(S) origin without credentials, ports, paths, or query values.")
            }

            val uri: URI
            try {
                uri = URI(value)
            } catch (_: Exception) {
                throw IllegalArgumentException("Enter a valid HTTP(S) origin.")
            }

            val scheme = uri.scheme?.lowercase(Locale.ROOT)
            if (scheme != "http" && scheme != "https") {
                throw IllegalArgumentException("Use a bare domain or HTTP(S) origin without credentials, ports, paths, or query values.")
            }
            if (uri.userInfo != null || uri.port != -1 || (uri.path != null && uri.path != "/" && uri.path.isNotEmpty()) ||
                uri.query != null || uri.fragment != null
            ) {
                throw IllegalArgumentException("Use a bare domain or HTTP(S) origin without credentials, ports, paths, or query values.")
            }

            val parsedHost = uri.host ?: authority
            hostname = parsedHost
        } else {
            if (value.any { it == '/' || it == ':' || it == '?' || it == '#' || it == '@' || it == '%' }) {
                throw IllegalArgumentException("Use a bare domain or HTTP(S) origin.")
            }
            val uri: URI
            try {
                uri = URI("http://$value")
            } catch (_: Exception) {
                throw IllegalArgumentException("Enter a valid domain name.")
            }
            hostname = uri.host ?: value
        }

        // Convert IDN to ASCII (Punycode) and lowercase
        val asciiHostname: String
        try {
            asciiHostname = IDN.toASCII(hostname, IDN.ALLOW_UNASSIGNED)
                .lowercase(Locale.ROOT)
                .trimEnd('.')
        } catch (_: Exception) {
            throw IllegalArgumentException("Enter a public-style domain name with at least two valid labels.")
        }

        val labels = asciiHostname.split('.')
        if (
            asciiHostname.length > 253 ||
            labels.size < 2 ||
            labels.any { !DOMAIN_LABEL_REGEX.matches(it) } ||
            IPV4_REGEX.matches(asciiHostname) ||
            ALL_DIGITS_REGEX.matches(labels.last())
        ) {
            throw IllegalArgumentException("Enter a public-style domain name with at least two valid labels.")
        }

        return asciiHostname
    }

    /**
     * Normalizes, deduplicates, and sorts a list of domain inputs up to maxDomains.
     */
    @Throws(IllegalArgumentException::class)
    fun normalizeDomainList(values: List<String>, maxDomains: Int = MAX_BLOCKED_DOMAINS): List<String> {
        val normalizedSet = values.map { normalizeDomainInput(it) }.toSet()
        val sortedList = normalizedSet.sorted()
        if (sortedList.size > maxDomains) {
            throw IllegalArgumentException("The local blocklist is limited to $maxDomains domains.")
        }
        return sortedList
    }
}
