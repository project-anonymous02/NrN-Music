/**
 * Metrolist Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.nrnmusic.music.utils

import android.content.Context
import com.nrnmusic.music.db.InternalDatabase
import com.nrnmusic.music.db.MusicDatabase
import com.nrnmusic.music.extensions.div
import com.nrnmusic.music.extensions.zipOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.OutputStream
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.zip.ZipEntry

object BackupArchive {
    const val SETTINGS_FILENAME = "settings.preferences_pb"
    const val FILENAME_PREFIX = "NrNMusic-backup-"
    const val BACKUP_DIRECTORY = "automatic-backups"

    private val filenameFormatter = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")

    fun suggestedFileName(now: ZonedDateTime = ZonedDateTime.now(ZoneId.systemDefault())): String =
        "$FILENAME_PREFIX${now.format(filenameFormatter)}.zip"

    fun write(
        context: Context,
        database: MusicDatabase,
        outputStream: OutputStream,
    ) {
        outputStream.zipOutputStream().use { zipOutputStream ->
            (context.filesDir / "datastore" / SETTINGS_FILENAME).inputStream().buffered().use { inputStream ->
                zipOutputStream.putNextEntry(ZipEntry(SETTINGS_FILENAME))
                inputStream.copyTo(zipOutputStream)
            }
            zipOutputStream.putNextEntry(ZipEntry(ArtistNameAliases.BACKUP_FILENAME))
            zipOutputStream.write(ArtistNameAliases.serialize().encodeToByteArray())

            database.checkpoint()

            val dbPath = database.openHelper.writableDatabase.path
            if (dbPath != null) {
                FileInputStream(dbPath).use { inputStream ->
                    zipOutputStream.putNextEntry(ZipEntry(InternalDatabase.DB_NAME))
                    inputStream.copyTo(zipOutputStream)
                }
                val walFile = File("$dbPath-wal")
                if (walFile.exists()) {
                    FileInputStream(walFile).use { inputStream ->
                        zipOutputStream.putNextEntry(ZipEntry("${InternalDatabase.DB_NAME}-wal"))
                        inputStream.copyTo(zipOutputStream)
                    }
                }
                val shmFile = File("$dbPath-shm")
                if (shmFile.exists()) {
                    FileInputStream(shmFile).use { inputStream ->
                        zipOutputStream.putNextEntry(ZipEntry("${InternalDatabase.DB_NAME}-shm"))
                        inputStream.copyTo(zipOutputStream)
                    }
                }
            }
        }
    }
}
