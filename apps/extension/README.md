# KidsGuard Chrome extension — parent-managed website filter

This unpacked Manifest V3 extension enforces parent-managed website restrictions and reports device presence to the KidsGuard backend. Filtering rules are configured by parents in the KidsGuard web dashboard and synchronized to this Chrome profile using Chrome's Declarative Net Request API.

The extension contains no child-side domain editing or unpairing controls; the parent dashboard and backend remain the sole source of truth for website restrictions.

## Architecture and security model

- **Parent-managed source of truth**: Website filtering rules and policy updates originate exclusively from the authenticated parent in the web dashboard.
- **No child-side modification**: Domain adding, domain deletion, policy cancellation, and device unpairing controls have been removed from the extension popup and service worker message handlers.
- **Secure device authentication**: Devices authenticate via a 256-bit bearer token issued during pairing-code redemption. Raw credentials are encapsulated inside the background service worker boundary (`chrome.storage.local`) and are never exposed to the popup DOM or runtime messages.
- **Declarative Net Request**: Top-level HTTP(S) navigations (`main_frame`) are blocked locally by Chrome's declarative rule engine using dedicated dynamic rule IDs (`1000..1099`).
- **Policy synchronization**: Policies are fetched securely from `GET /api/v1/devices/policy` and acknowledged via `POST /api/v1/devices/policy/ack` upon successful rule application in Chrome.
- **Periodic heartbeat**: A 15-minute background alarm (`kidsguard_heartbeat`) triggers device heartbeat updates and policy synchronization.
- **Honest offline status**: When offline or if the backend is unreachable, previously applied rules remain active in Chrome Declarative Net Request. The popup explicitly discloses offline status and preserves local protection without claiming unauthorized states.

## Permissions

- `declarativeNetRequest`: Enables Chrome to block top-level navigations matching parent-configured domains without requiring broad web traffic read permissions.
- `storage`: Preserves device pairing sessions and synchronized rules in `chrome.storage.local` across service worker restarts.
- `alarms`: Schedules the 15-minute periodic background heartbeat and policy synchronization cycle.
- `host_permissions`: Narrowly scoped to local development servers (`http://localhost:5000/*` and `http://127.0.0.1:5000/*`). Broad wildcards (`<all_urls>`, `*://*/*`) are strictly rejected.

## Manual verification in Google Chrome

Follow these steps to verify end-to-end policy synchronization and enforcement:

### 1. Start the local backend and frontend

In two terminal windows:
```powershell
npm run dev:backend
npm run dev:frontend
```

### 2. Issue a pairing code from the parent dashboard

1. Open `http://localhost:5173` in your browser.
2. Sign in with parent credentials (or register a test account).
3. Create or select a child profile.
4. Under **Paired devices**, click **Pair new device** to generate a 22-character pairing code (valid for 15 minutes).

### 3. Load the unpacked extension in Chrome

1. Open a new Chrome profile and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in top right).
3. Click **Load unpacked** and select the `apps/extension` folder from this repository.
4. Verify the KidsGuard extension icon appears in the toolbar.

### 4. Pair the extension

1. Click the KidsGuard extension icon to open the popup.
2. Confirm the status displays **Unpaired** and no domain editing controls are present.
3. Paste the 22-character pairing code, enter a device name (e.g., `Chrome Laptop`), and click **Pair device**.
4. Confirm the status badge transitions to **Paired** with device metadata (Device Name, Device ID, Platform, Policy version, and Last synced).

### 5. Configure website restrictions as parent

1. In the parent dashboard (`http://localhost:5173`), open the child's **Policy & Web Restrictions** settings.
2. Enable **Web Restrictions** and add test domains, for example: `example.com`.
3. Click **Save policy**.

### 6. Verify policy synchronization and enforcement in the extension

1. In the Chrome extension popup, click **Sync with parent policy** (or wait for the 15-minute heartbeat cycle).
2. Verify that `example.com` appears under **Blocked domains** and the status reports `Rules applied for 1 domain.`.
3. Open a new tab in Chrome and navigate to `https://example.com` or `https://www.example.com`.
4. Confirm Chrome blocks the navigation with `ERR_BLOCKED_BY_CLIENT`.
5. Navigate to an unblocked site (e.g., `https://wikipedia.org`) and confirm navigation succeeds normally.

### 7. Verify policy update and rule removal

1. In the parent dashboard, remove `example.com` or disable Web Restrictions, then save.
2. In the extension popup, click **Sync with parent policy**.
3. Verify the domain list is cleared and status confirms `Rules applied for 0 domains.`.
4. Refresh `https://example.com` in Chrome and verify the site now loads.

### 8. Verify honest offline behavior

1. Stop the backend server (`Ctrl+C` in the backend terminal) or disconnect network.
2. Open the extension popup: observe that the heartbeat/sync display honestly shows `(offline - local rules active)` or `Offline (will retry)`.
3. Verify that any previously active block rules remain enforced in Chrome while offline.

## Automated checks

From the repository root:

```powershell
# Run extension tests (unit and integration)
npm test --workspace @kidsguard/extension

# Run full project test suite
npm test
```
