/**
 * Metrolist Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.metrolist.music.backup

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.metrolist.music.constants.AutoBackupEnabledKey
import com.metrolist.music.constants.AutoBackupFrequencyKey
import com.metrolist.music.constants.AutoBackupLastSuccessEpochKey
import com.metrolist.music.db.MusicDatabase
import com.metrolist.music.utils.BackupArchive
import com.metrolist.music.utils.dataStore
import com.metrolist.music.utils.safeDataStoreEdit
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first
import timber.log.Timber
import java.io.File
import java.util.concurrent.TimeUnit

@EntryPoint
@InstallIn(SingletonComponent::class)
interface AutomaticBackupEntryPoint {
    fun musicDatabase(): MusicDatabase
}

class AutomaticBackupWorker(
    context: Context,
    parameters: WorkerParameters,
) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        val preferences = applicationContext.dataStore.data.first()
        if (preferences[AutoBackupEnabledKey] != true) return Result.success()

        val frequency =
            AutoBackupFrequency.fromSetting(
                preferences[AutoBackupFrequencyKey] ?: AutoBackupFrequency.WEEKLY.name,
            )
        val lastSuccess = preferences[AutoBackupLastSuccessEpochKey] ?: 0L
        if (!isAutoBackupDue(lastSuccess, System.currentTimeMillis(), frequency)) {
            return Result.success()
        }

        val directory = File(applicationContext.filesDir, BackupArchive.BACKUP_DIRECTORY)
        if (!directory.exists() && !directory.mkdirs()) {
            Timber.tag(TAG).e("Could not create automatic backup directory")
            return Result.retry()
        }

        val destination = nextBackupFile(directory)
        return try {
            val database =
                EntryPointAccessors
                    .fromApplication(applicationContext, AutomaticBackupEntryPoint::class.java)
                    .musicDatabase()
            destination.outputStream().use { outputStream ->
                BackupArchive.write(applicationContext, database, outputStream)
            }
            applicationContext.safeDataStoreEdit {
                it[AutoBackupLastSuccessEpochKey] = System.currentTimeMillis()
            }
            pruneBackups(directory)
            Result.success()
        } catch (error: CancellationException) {
            destination.delete()
            throw error
        } catch (error: Exception) {
            destination.delete()
            Timber.tag(TAG).e(error, "Automatic backup failed")
            Result.retry()
        }
    }

    private fun nextBackupFile(directory: File): File {
        val baseName = BackupArchive.suggestedFileName().removeSuffix(".zip")
        var index = 0
        while (true) {
            val suffix = if (index == 0) "" else "-$index"
            val file = File(directory, "$baseName$suffix.zip")
            if (!file.exists()) return file
            index++
        }
    }

    private fun pruneBackups(directory: File) {
        directory
            .listFiles { file -> file.isFile && file.extension == "zip" }
            .orEmpty()
            .sortedByDescending(File::lastModified)
            .drop(MAX_RETAINED_BACKUPS)
            .forEach { runCatching { it.delete() } }
    }

    companion object {
        private const val TAG = "AutomaticBackup"
        private const val WORK_NAME = "automatic-backup"
        private const val MAX_RETAINED_BACKUPS = 10

        fun schedule(
            context: Context,
            enabled: Boolean,
            frequency: AutoBackupFrequency,
        ) {
            val workManager = WorkManager.getInstance(context)
            if (!enabled) {
                workManager.cancelUniqueWork(WORK_NAME)
                return
            }
            val request =
                PeriodicWorkRequestBuilder<AutomaticBackupWorker>(
                    frequency.intervalMillis,
                    TimeUnit.MILLISECONDS,
                ).build()
            workManager.enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request,
            )
        }
    }
}
