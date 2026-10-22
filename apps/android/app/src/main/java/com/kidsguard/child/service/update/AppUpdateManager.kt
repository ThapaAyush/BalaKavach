package com.kidsguard.child.service.update

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import com.kidsguard.child.data.local.ServerConfigStorage
import com.kidsguard.child.data.model.ApiResult
import com.kidsguard.child.data.model.AppUpdateInfo
import com.kidsguard.child.data.remote.KidsGuardApiClient
import java.io.File

/**
 * Manages checking, downloading, and installing app updates smoothly.
 * Supports both background DownloadManager installation via FileProvider and direct browser fallback.
 */
class AppUpdateManager(
    private val context: Context,
    private val apiClient: KidsGuardApiClient,
    private val serverConfigStorage: ServerConfigStorage
) {
    companion object {
        private const val TAG = "AppUpdateManager"
        const val UPDATE_FILE_NAME = "balakavach-companion-update.apk"
    }

    suspend fun checkForUpdates(
        currentVersionCode: Int,
        currentVersionName: String
    ): ApiResult<AppUpdateInfo> {
        val baseUrl = serverConfigStorage.getApiBaseUrl()
        return apiClient.checkForAppUpdate(
            apiBaseUrl = baseUrl,
            currentVersionCode = currentVersionCode,
            currentVersionName = currentVersionName
        )
    }

    fun resolveAbsoluteDownloadUrl(rawUrl: String): String {
        if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
            return rawUrl
        }
        val apiBase = serverConfigStorage.getApiBaseUrl()
        val rootOrigin = try {
            val uri = Uri.parse(apiBase)
            val portPart = if (uri.port != -1) ":${uri.port}" else ""
            "${uri.scheme}://${uri.host}$portPart"
        } catch (_: Exception) {
            "https://balakavach-be.onrender.com"
        }
        val path = if (rawUrl.startsWith("/")) rawUrl else "/$rawUrl"
        return "$rootOrigin$path"
    }

    /**
     * Enqueues an APK download via Android's DownloadManager.
     * When completed, prompts the package installer via FileProvider.
     */
    fun startDownloadAndInstall(
        updateInfo: AppUpdateInfo,
        onDownloadStarted: (() -> Unit)? = null,
        onError: ((String) -> Unit)? = null
    ): Long {
        val absoluteUrl = resolveAbsoluteDownloadUrl(updateInfo.downloadUrl)

        return try {
            val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val destinationFile = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), UPDATE_FILE_NAME)
            if (destinationFile.exists()) {
                destinationFile.delete()
            }

            val request = DownloadManager.Request(Uri.parse(absoluteUrl)).apply {
                setTitle("BalaKavach Update v${updateInfo.latestVersionName}")
                setDescription("Downloading latest companion build...")
                setMimeType("application/vnd.android.package-archive")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationUri(Uri.fromFile(destinationFile))
                setAllowedOverMetered(true)
                setAllowedOverRoaming(true)
            }

            val downloadId = downloadManager.enqueue(request)
            onDownloadStarted?.invoke()

            // Register completion receiver
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(c: Context?, intent: Intent?) {
                    val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) ?: -1L
                    if (id == downloadId) {
                        try {
                            context.unregisterReceiver(this)
                        } catch (_: Exception) {}

                        if (destinationFile.exists() && destinationFile.length() > 0) {
                            installApk(context, destinationFile)
                        } else {
                            onError?.invoke("Downloaded update file was incomplete.")
                        }
                    }
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(
                    receiver,
                    IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                    Context.RECEIVER_EXPORTED
                )
            } else {
                context.registerReceiver(
                    receiver,
                    IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
                )
            }

            downloadId
        } catch (e: Exception) {
            Log.e(TAG, "Download initiation failed", e)
            onError?.invoke(e.message ?: "Failed to start update download")
            -1L
        }
    }

    /**
     * Prompts the Android Package Installer for the specified APK file.
     */
    fun installApk(context: Context, apkFile: File) {
        try {
            // Android 8.0+ unknown sources permission check
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!context.packageManager.canRequestPackageInstalls()) {
                    val manageIntent = Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${context.packageName}")
                    ).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(manageIntent)
                }
            }

            val apkUri: Uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                apkFile
            )

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            context.startActivity(installIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch package installer", e)
            openInBrowser(context, AppUpdateInfo(
                latestVersionName = "",
                latestVersionCode = 0,
                updateAvailable = true,
                downloadUrl = resolveAbsoluteDownloadUrl("/api/v1/app-update/download")
            ))
        }
    }

    /**
     * Fallback mechanism: Opens browser directly to download the APK.
     */
    fun openInBrowser(context: Context, updateInfo: AppUpdateInfo) {
        val absoluteUrl = resolveAbsoluteDownloadUrl(updateInfo.downloadUrl)
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(absoluteUrl)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open browser for download", e)
        }
    }
}
