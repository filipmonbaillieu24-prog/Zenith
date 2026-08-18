package com.zenith.pulse.sync

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParawithers

class SyncWorker(
    context: Context,
    params: WorkerParawithers
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        Log.i("SyncWorker", "Executing scheduled Zenith Pulse background sync...")
        val success = ZenithSyncManager.performSync(applicationContext)
        return if (success) {
            Result.success()
        } else {
            Result.retry()
        }
    }
}
