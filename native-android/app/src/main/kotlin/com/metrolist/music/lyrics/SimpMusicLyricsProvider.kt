/**
 * Metrolist Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.metrolist.music.lyrics

import android.content.Context
import com.metrolist.music.constants.EnableSimpMusicKey
import com.metrolist.music.utils.dataStore
import com.metrolist.music.utils.get
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.abs

object SimpMusicLyricsProvider : LyricsProvider {
    private const val BASE_URL = "https://api-lyrics.simpmusic.org/v1"
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val client by lazy { HttpClient(OkHttp) }

    override val name = "SimpMusic"

    override fun isEnabled(context: Context): Boolean =
        context.dataStore[EnableSimpMusicKey] ?: true

    override suspend fun getLyrics(
        context: Context,
        id: String,
        title: String,
        artist: String,
        duration: Int,
        album: String?,
    ): Result<String> =
        try {
            Result.success(fetchLyrics(id, duration))
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            Result.failure(error)
        }

    private suspend fun fetchLyrics(videoId: String, duration: Int): String {
        require(videoId.isNotBlank() && !videoId.startsWith("local_")) {
            "SimpMusic requires a YouTube video id"
        }

        val response =
            client.get("$BASE_URL/$videoId") {
                header("User-Agent", "SimpMusicLyrics/1.0")
                header("Accept", "application/json")
            }
        check(response.status == HttpStatusCode.OK) {
            "SimpMusic returned HTTP ${response.status.value}"
        }

        val root = json.parseToJsonElement(response.bodyAsText()).jsonObject
        check(root["type"]?.jsonPrimitive?.contentOrNull == "success") {
            "SimpMusic lyrics lookup failed"
        }
        val data = root["data"]?.jsonArray ?: error("SimpMusic response is missing lyrics")
        check(data.isNotEmpty()) { "SimpMusic has no lyrics for this track" }

        val tracks =
            if (duration > 0) {
                val filtered =
                    data.filter {
                        abs((it.jsonObject["durationSeconds"]?.jsonPrimitive?.intOrNull ?: 0) - duration) <= 10
                    }
                filtered.ifEmpty { data.toList() }
            } else {
                data.toList()
            }

        val best =
            if (duration > 0) {
                tracks.minByOrNull {
                    abs((it.jsonObject["durationSeconds"]?.jsonPrimitive?.intOrNull ?: 0) - duration)
                }
            } else {
                tracks.firstOrNull()
            } ?: error("SimpMusic has no lyrics for this track")

        val lyrics =
            best
                .jsonObject["richSyncLyrics"]
                ?.jsonPrimitive
                ?.contentOrNull
                ?.takeIf { it.isNotBlank() }
                ?: best
                    .jsonObject["syncedLyrics"]
                    ?.jsonPrimitive
                    ?.contentOrNull
                    ?.takeIf { it.isNotBlank() }
                ?: error("SimpMusic has no synced lyrics for this track")

        return lyrics
            .lines()
            .filterNot { line ->
                line
                    .trim()
                    .replace(Regex("""^(?:\[\d{1,2}:\d{2}\.\d{2,3}])+"""), "")
                    .trim()
                    .equals("Synced by Noob.exe", ignoreCase = true)
            }.joinToString("\n")
            .trim()
            .also { check(it.isNotBlank()) { "SimpMusic returned empty lyrics" } }
    }
}
