/**
 * Metrolist Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.metrolist.music.playback

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import java.security.MessageDigest

private val sponsorBlockCategories = setOf("sponsor", "selfpromo", "interaction")

data class SponsorBlockSegment(
    val startMs: Long,
    val endMs: Long,
)

fun parseSponsorBlockSegments(
    body: String,
    videoId: String,
): List<SponsorBlockSegment> {
    val videos = Json.parseToJsonElement(body) as? JsonArray ?: return emptyList()
    val video =
        videos.filterIsInstance<JsonObject>().firstOrNull {
            (it["videoID"] as? JsonPrimitive)?.contentOrNull == videoId
        }
    val segments = video?.get("segments") as? JsonArray ?: return emptyList()
    val valid =
        segments
            .mapNotNull { element ->
                val segment = element as? JsonObject ?: return@mapNotNull null
                if ((segment["category"] as? JsonPrimitive)?.contentOrNull !in sponsorBlockCategories ||
                    (segment["actionType"] as? JsonPrimitive)?.contentOrNull != "skip"
                ) {
                    return@mapNotNull null
                }
                val range = segment["segment"] as? JsonArray ?: return@mapNotNull null
                if (range.size != 2) return@mapNotNull null
                val start = (range[0] as? JsonPrimitive)?.doubleOrNull ?: return@mapNotNull null
                val end = (range[1] as? JsonPrimitive)?.doubleOrNull ?: return@mapNotNull null
                if (!start.isFinite() || !end.isFinite() || start < 0 || end <= start || end * 1000 >= Long.MAX_VALUE.toDouble()) {
                    return@mapNotNull null
                }
                SponsorBlockSegment((start * 1000).toLong(), (end * 1000).toLong()).takeIf { it.endMs > it.startMs }
            }.sortedBy { it.startMs }
    val merged = mutableListOf<SponsorBlockSegment>()
    for (segment in valid) {
        val previous = merged.lastOrNull()
        if (previous != null && segment.startMs <= previous.endMs) {
            merged[merged.lastIndex] = previous.copy(endMs = maxOf(previous.endMs, segment.endMs))
        } else {
            merged += segment
        }
    }
    return merged
}

fun List<SponsorBlockSegment>.skipTarget(
    positionMs: Long,
    durationMs: Long,
): Long? =
    firstOrNull {
        positionMs >= it.startMs && positionMs < it.endMs && (durationMs <= 0 || it.endMs <= durationMs)
    }?.endMs

class SponsorBlockClient private constructor(
    private val httpClient: HttpClient,
) {
    private data class CachedSegments(
        val segments: List<SponsorBlockSegment>,
        val fetchedAt: Long,
    )

    private val cache = mutableMapOf<String, CachedSegments>()
    private val mutex = Mutex()

    suspend fun segments(videoId: String): List<SponsorBlockSegment> =
        mutex.withLock {
            val now = System.currentTimeMillis()
            cache[videoId]?.let {
                val lifetime = if (it.segments.isEmpty()) 5 * 60_000L else 60 * 60_000L
                if (now - it.fetchedAt < lifetime) return@withLock it.segments
                cache.remove(videoId)
            }
            val segments =
                try {
                    val digest = MessageDigest.getInstance("SHA-256").digest(videoId.toByteArray())
                    val prefix =
                        digest.take(2).joinToString("") {
                            (it.toInt() and 0xff).toString(16).padStart(2, '0')
                        }
                    val response =
                        httpClient.get("https://sponsor.ajay.app/api/skipSegments/$prefix") {
                            sponsorBlockCategories.forEach { parameter("category", it) }
                            parameter("actionType", "skip")
                        }
                    if (response.status == HttpStatusCode.OK) {
                        parseSponsorBlockSegments(response.bodyAsText(), videoId)
                    } else {
                        emptyList()
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    emptyList()
                }
            if (cache.size >= 64) cache.remove(cache.keys.first())
            cache[videoId] = CachedSegments(segments, now)
            segments
        }

    companion object {
        val shared: SponsorBlockClient by lazy {
            SponsorBlockClient(
                HttpClient(OkHttp) {
                    install(HttpTimeout) {
                        requestTimeoutMillis = 5_000
                    }
                }
            )
        }
    }
}
