# KidsGuard Android Child Companion Application

## 1. Overview

The KidsGuard Android Child Application is a minimal, transparent companion application written in Kotlin. It links a child device to a KidsGuard parent account, synchronizes parent-managed policies, reports measured screen-time usage via Android's official `UsageStatsManager` API, and provides read-only visibility into device status, daily limits, and quiet hours.

**Key Architecture Principles:**
- **No VPN or Packet Interception**: Android network traffic is not diverted or intercepted through local VPNs or proxy services.
- **Parent-Controlled Single Authority**: Screen-time rules, quiet hours, and supported restrictions are managed exclusively from the KidsGuard parent web dashboard. The child application contains NO domain editing, policy modification, or unpairing controls.
- **Zero Spyware & Honest Disclosures**: No covert monitoring, audio/camera access, keystroke logging, or stealth features. Honest disclosure of Android platform boundaries (ordinary apps cannot block other apps, cannot enforce hard system lockouts, and cannot prevent uninstallation).
- **Zero Fabrication**: Screen-time usage is reported strictly as measured. When the child has not granted "Usage Access" permission, usage duration is reported as `null` (never fabricated).
- **Hardware-Backed Credential Security**: The 256-bit device credential returned during pairing is encrypted using Android Keystore AES-256-GCM (`androidx.security:security-crypto`).

---

## 2. Project Architecture & Structure

```
apps/android/
├── build.gradle.kts                # Root project build configuration
├── settings.gradle.kts             # Project settings (includes :app)
├── gradle.properties               # JVM options & AndroidX flags
├── gradlew / gradlew.bat           # Gradle 8.13 wrapper scripts
├── gradle/wrapper/                 # Wrapper properties & jar
├── README.md                       # This comprehensive documentation
├── test/                           # Automated contract tests (Node.js test runner)
│   ├── child-controls.contract.test.js
│   ├── device-client.contract.test.js
│   ├── domain-normalizer.contract.test.js
│   ├── screen-time.contract.test.js
│   └── vpn-absence.contract.test.js
└── app/
    ├── build.gradle.kts            # Application module configuration (compileSdk 34, minSdk 26)
    ├── proguard-rules.pro          # ProGuard rules preserving models and JSON classes
    └── src/
        ├── main/
        │   ├── AndroidManifest.xml # Permissions (PACKAGE_USAGE_STATS, INTERNET), Application, MainActivity
        │   ├── res/
        │   │   ├── values/         # strings.xml, colors.xml, themes.xml
        │   │   ├── layout/         # activity_main.xml
        │   │   └── xml/            # network_security_config.xml, data_extraction_rules.xml
        │   └── java/com/kidsguard/child/
        │       ├── KidsGuardApp.kt             # Central dependency injection container
        │       ├── data/
        │       │   ├── model/                  # DeviceSession, PairingModels, HeartbeatModels, PolicyModels, ScreenTimeModels
        │       │   ├── local/                  # SecureCredentialStorage (Keystore), LocalPolicyStorage, ServerConfigStorage, SessionStorage
        │       │   ├── remote/                 # KidsGuardApiClient (HTTP client, explicit timeouts, zero secret logging)
        │       │   └── repository/             # DeviceRepository, PolicyRepository
        │       ├── domain/rules/               # DomainNormalizer, DomainRuleEngine
        │       ├── service/
        │       │   ├── usage/                  # UsageStatsReader, UsageStatsHelper (event aggregation without double-counting)
        │       │   └── work/                   # HeartbeatWorker (full sync), HeartbeatScheduler (WorkManager)
        │       └── ui/
        │           ├── MainActivity.kt         # Read-only 4-tab companion activity
        │           └── MainViewModel.kt        # ViewModel managing sync, screen time, and status
        └── test/java/com/kidsguard/child/      # Automated JUnit 4 unit tests
            ├── DeviceRepositoryTest.kt
            ├── DomainNormalizerTest.kt
            ├── DomainRuleEngineTest.kt
            ├── KidsGuardApiClientTest.kt
            ├── LocalPolicyStorageTest.kt
            ├── PolicyRepositoryTest.kt
            ├── SecureCredentialStorageTest.kt
            └── UsageStatsReaderTest.kt
```

---

## 3. Supported Android Versions & Tooling

- **Minimum SDK**: Android 8.0 (API level 26, Oreo)
- **Target / Compile SDK**: Android 14 (API level 34, UpsideDownCake)
- **Language**: Kotlin 1.9.23
- **Java Compatibility**: Java 17 / 21
- **Gradle**: 8.13 (managed via Gradle Wrapper)
- **Android Gradle Plugin (AGP)**: 8.3.2

---

## 4. Development & Networking Guide

The API base URL can be configured directly in the in-app **Settings** tab.

- **Android Emulator**:
  - URL: `http://10.0.2.2:5000/api/v1`
  - Host loopback `127.0.0.1` maps to `10.0.2.2` inside the emulator.
- **Physical Android Device on LAN**:
  - URL: `http://<YOUR_COMPUTER_LOCAL_IP>:5000/api/v1` (e.g., `http://192.168.1.100:5000/api/v1`)
- **Production Server**:
  - URL: `https://api.yourdomain.com/api/v1` (HTTPS strictly required for non-local hosts).

---

## 5. Screen-Time Measurement & UsageStatsManager

### Aggregation Without Double-Counting
To prevent inflated usage from background services or concurrent intervals:
1. The app queries `UsageEvents` over the current day (midnight local time to present).
2. It tracks the single active foreground package at any moment using `ACTIVITY_RESUMED`, `ACTIVITY_PAUSED`, and `ACTIVITY_STOPPED` transitions.
3. Total measured screen time is the sum of non-overlapping foreground durations.

### Zero-Fabrication Rule
- If the child has not granted Usage Access:
  - `permissionGranted: false`
  - `totalScreenTimeSeconds: null` (strictly null)
  - `source: "unavailable"`
  - `appUsage: []`
- When granted:
  - `permissionGranted: true`
  - `totalScreenTimeSeconds: <measured_seconds>`
  - `source: "measured"`
  - `appUsage: [<top 50 apps with non-zero foreground durations>]`

---

## 6. Permissions & Privacy Disclosures

| Permission | Purpose |
| :--- | :--- |
| `android.permission.INTERNET` | Communicates with the KidsGuard backend API for pairing, heartbeats, policy sync, and screen-time reports. |
| `android.permission.ACCESS_NETWORK_STATE` | Detects network connectivity to avoid draining battery on doomed background requests. |
| `android.permission.PACKAGE_USAGE_STATS` | Measures daily foreground application usage with explicit user consent. |

---

## 7. Running Automated Tests & Builds

### Automated Contract Tests (Node.js Test Runner)
```powershell
node --test apps/android/test/*.contract.test.js
```

### Android Gradle Unit Tests
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat testDebugUnitTest
```

### Android Debug APK Build
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleDebug
```
