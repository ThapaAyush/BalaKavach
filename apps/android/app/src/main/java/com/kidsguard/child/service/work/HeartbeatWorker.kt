package com.kidsguard.child.service.work

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.kidsguard.child.KidsGuardApp
import com.kidsguard.child.data.model.ApiResult
import com.kidsguard.child.data.model.DeviceSession

/**
 * WorkManager CoroutineWorker for periodic device presence, policy synchronization,
 * and screen-time usage reporting.
 * Respects Android background battery optimizations and network constraints.
 */
class HeartbeatWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val app = applicationContext as? KidsGuardApp ?: return Result.failure()
        val deviceRepo = app.deviceRepository
        val policyRepo = app.policyRepository
        val usageReader = app.usageStatsReader

        val currentSession = deviceRepo.deviceSession.value
        if (!currentSession.isPaired) {
            return Result.success()
        }

        if (currentSession.pairingStatus == DeviceSession.STATUS_INVALID_SESSION) {
            // Do not continue retrying when session is invalid
            return Result.success()
        }

        return when (val result = deviceRepo.syncAll(policyRepo, usageReader)) {
            is ApiResult.Success -> {
                Result.success()
            }
            is ApiResult.Error -> {
                if (result.statusCode == 401 || result.isAuthError) {
                    Result.success()
                } else if (result.isNetworkError || result.isTemporaryFailure) {
                    Result.retry()
                } else {
                    Result.failure()
                }
            }
        }
    }
}
