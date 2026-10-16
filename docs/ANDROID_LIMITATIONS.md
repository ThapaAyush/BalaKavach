# Android status and limitations

## Current implementation (`apps/android`)

KidsGuard includes a lightweight, transparent Android child companion application written in pure Kotlin targeting Android 14 (API 34) with a minimum requirement of Android 8.0 (API 26).

### Implemented capabilities

- **Device enrollment & secure storage**: Pairs with the KidsGuard parent backend using single-use 22-character base64url pairing codes (`POST /api/v1/device-pairing/redeem`). Stores the issued 256-bit bearer device credential encrypted with Android Keystore AES-256-GCM (`androidx.security:security-crypto`). Raw credentials are never logged, exposed in UI state, or included in Android system backups (`data_extraction_rules.xml`).
- **Presence heartbeats**: Employs Android Jetpack `WorkManager` with a `NetworkType.CONNECTED` constraint to run periodic heartbeats (`POST /api/v1/devices/heartbeat`) at the Android minimum periodic interval of 15 minutes. Treats HTTP 401 neutrally as `invalid_session` without claiming parent revocation, halting periodic tasks until explicit re-pairing or reset.
- **Screen-time measurement**: Uses Android's official `UsageStatsManager` with the `PACKAGE_USAGE_STATS` permission to aggregate foreground device usage without double-counting active applications.
- **Zero-fabrication rule**: When the child or system has not granted "Usage Access" permission, usage duration is reported strictly as `null`. Synthetic or estimated values are never generated or reported.
- **Contract verification**: 14 automated contract tests executed via Node.js test runner in the root workspace verify domain normalization, URL parsing, credential bounds, screen-time zero-fabrication, child control absence, and VPN absence.

## Platform boundaries and limitations

1. **No universal browser blocking**: Ordinary Android applications cannot intercept, inspect, or filter web traffic across third-party web browsers (e.g., Chrome, Firefox, Opera) without Device Owner / MDM management capabilities.
2. **No VPN or packet interception**: The Android companion app deliberately contains no `VpnService`, proxy redirectors, or packet inspection services. Network traffic flows directly through standard system networking.
3. **No uninstallation prevention**: Standard user-space Android apps cannot prevent a device user from uninstalling the application or revoking permissions in Android System Settings without Device Administrator or Device Owner enrollment.
4. **No hidden surveillance**: The application requires explicit foreground launch and user interaction. It requests no camera, microphone, keystroke, or location permissions, and implements no stealth or covert monitoring features.
5. **Native build prerequisites**: Automated contract tests verify API contracts and state machines in Node.js. Compiling and running the native Android application requires a workstation configured with JDK 17 / 21 and the Android SDK (API 34).
