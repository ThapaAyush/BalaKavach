package com.kidsguard.child.service.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Manages scheduling and cancelling the periodic WorkManager heartbeat task.
 */
class HeartbeatScheduler(private val context: Context) {

    companion object {
        const val WORK_NAME = "kidsguard_heartbeat_worker"
        // WorkManager minimum periodic interval is 15 minutes
        const val HEARTBEAT_INTERVAL_MINUTES = 15L
    }

    private val workManager by lazy {
        WorkManager.getInstance(context)
    }

    /**
     * Schedules periodic heartbeat synchronization.
     * Uses ExistingPeriodicWorkPolicy.KEEP to preserve existing schedules without reset.
     */
    fun schedulePeriodicHeartbeat() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val periodicWorkRequest = PeriodicWorkRequestBuilder<HeartbeatWorker>(
            HEARTBEAT_INTERVAL_MINUTES,
            TimeUnit.MINUTES
        )
            .setConstraints(constraints)
            .build()

        workManager.enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            periodicWorkRequest
        )
    }

    /**
     * Cancels the periodic heartbeat synchronization task.
     */
    fun cancelPeriodicHeartbeat() {
        workManager.cancelUniqueWork(WORK_NAME)
    }
}
