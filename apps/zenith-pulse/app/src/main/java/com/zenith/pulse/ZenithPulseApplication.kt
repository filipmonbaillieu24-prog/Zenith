package com.zenith.pulse

import android.app.Application
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.zenith.pulse.data.LocalHttpServer
import com.zenith.pulse.sync.SyncWorker
import java.util.concurrent.TimeUnit

class ZenithPulseApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        Log.i("ZenithPulse", "Initializing Zenith Pulse Application...")

        // Start embedded Local HTTP Server on port 8787
        LocalHttpServer.startServer(applicationContext)

        // Schedule periodic background sync worker (runs hourly)
        setupBackgroundSync()
    }

    private fun setupBackgroundSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(1, TimeUnit.HOURS)
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "ZenithPulseSyncWorker",
            ExistingPeriodicWorkPolicy.REPLACE,
            syncRequest
        )
    }
}
