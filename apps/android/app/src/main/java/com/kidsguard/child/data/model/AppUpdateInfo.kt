package com.kidsguard.child.data.model

/**
 * Data model representing the latest available version of the Android companion app.
 */
data class AppUpdateInfo(
    val platform: String = "android",
    val latestVersionName: String,
    val latestVersionCode: Int,
    val updateAvailable: Boolean,
    val downloadUrl: String,
    val directApkUrl: String = "/balakavach-companion.apk",
    val releaseNotes: String = "",
    val publishedAt: String = "",
    val fileSizeBytes: Long = 0L,
    val mandatory: Boolean = false
)
