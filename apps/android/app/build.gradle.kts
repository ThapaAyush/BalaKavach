import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val releaseApiBaseUrl: String = (project.findProperty("KIDSGUARD_RELEASE_API_URL") as? String)
    ?.trim()
    ?.takeIf { it.isNotEmpty() }
    ?: System.getenv("KIDSGUARD_RELEASE_API_URL")?.trim()?.takeIf { it.isNotEmpty() }
    ?: "https://balakavach-be.onrender.com/api/v1"

android {
    namespace = "com.kidsguard.child"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.kidsguard.child"
        minSdk = 26
        targetSdk = 34
        versionCode = 10
        versionName = "0.1.9"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            buildConfigField("String", "DEFAULT_API_BASE_URL", "\"$releaseApiBaseUrl\"")
        }
        debug {
            applicationIdSuffix = ".debug"
            isDebuggable = true
            buildConfigField("String", "DEFAULT_API_BASE_URL", "\"https://balakavach-be.onrender.com/api/v1\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = true
        buildConfig = true
    }
}

tasks.register("validateReleaseApiUrl") {
    description = "Validates that a production HTTPS API URL is configured for release builds."
    doLast {
        if (releaseApiBaseUrl == "UNCONFIGURED_PRODUCTION_URL" || releaseApiBaseUrl.isBlank()) {
            throw GradleException(
                "Release build blocked: Release API base URL is unconfigured. " +
                "Provide a real HTTPS production URL via project property -PKIDSGUARD_RELEASE_API_URL=<url> " +
                "or environment variable KIDSGUARD_RELEASE_API_URL=<url>. " +
                "Release builds must never use or fall back to localhost."
            )
        }
        if (!releaseApiBaseUrl.startsWith("https://")) {
            throw GradleException(
                "Release build blocked: Release API base URL must use HTTPS. Provided: '$releaseApiBaseUrl'"
            )
        }
        val host = try {
            URI(releaseApiBaseUrl).host?.lowercase() ?: ""
        } catch (_: Exception) {
            ""
        }
        val isLocalhost = host == "localhost" || host == "127.0.0.1" || host == "10.0.2.2" || host == "[::1]" || host.isEmpty()
        if (isLocalhost) {
            throw GradleException(
                "Release build blocked: Release API base URL cannot use localhost or loopback host '$host'."
            )
        }
    }
}

tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    dependsOn("validateReleaseApiUrl")
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-livedata-ktx:2.7.0")
    implementation("androidx.activity:activity-ktx:1.8.2")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("androidx.work:work-runtime-ktx:2.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
    testImplementation("org.mockito:mockito-core:5.11.0")
    testImplementation("org.mockito.kotlin:mockito-kotlin:5.2.1")
    testImplementation("org.json:json:20231013")
}
