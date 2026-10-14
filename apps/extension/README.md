# KidsGuard Chrome extension foundation

This unpacked Manifest V3 extension applies a small, locally configured blocklist to top-level HTTP(S) website navigations in one Chrome profile. It is independent of the KidsGuard API and account. It does not pair devices, synchronize remote policy, block subresources or apps, resist removal, authenticate a device, or provide complete parental controls. It has no allowlist; there is no allowlist precedence behavior.

## Permissions

- `declarativeNetRequest` lets Chrome apply declarative block rules to top-level navigations. The extension does not need broad site host permissions, `webRequest`, or page-content access for these block rules.
- `storage` saves the configured domain list in `chrome.storage.local` so the rules can be restored after the service worker or browser restarts.

The extension does not request `tabs`, `activeTab`, host permissions, cookies, scripting, or network access to the KidsGuard API. Chrome 101 or later is required for the MV3 module service worker and `requestDomains` rule conditions.

## Load and manually verify in Chrome

1. From the repository root, install workspace dependencies with `npm install` if needed. No backend or `.env` configuration is required for this extension.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the repository's `apps/extension` directory.
4. Open the KidsGuard extension popup, enter `example.com`, and choose **Add**. The popup should report that rules were applied for one domain.
5. Navigate to `https://example.com` and a subdomain such as `https://www.example.com`; Chrome should block those top-level navigations. This stage's automated tests do not verify this browser behavior.
6. Open the extension popup and choose **Remove** beside `example.com`. The popup should report that rules were applied for zero domains; reload the site to confirm it is no longer blocked.
7. If the popup reports an error, open `chrome://extensions`, find the extension's **Errors** panel, and inspect its service worker with **Inspect views**. The UI distinguishes a saved list from rules Chrome confirmed as active; a failed atomic update leaves the previous rule set intact.

The input accepts a bare domain or HTTP(S) origin. Input is lower-cased and IDNs become ASCII punycode. Credentials, ports, paths, queries, fragments, wildcard entries, IP addresses, malformed hostnames, and unsupported schemes are rejected. The list supports at most 100 unique domains. Each domain matches itself and its subdomains for `main_frame` requests only.

## Automated checks

From the repository root:

```powershell
npm test --workspace @kidsguard/extension
```

These Node tests cover pure validation/matching/rule generation and rule-manager behavior through a fake Chrome API. They are not an integration test of Chrome's declarative request engine. Real browser enforcement remains a manual verification step.
