/**
 * Metrolist Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.metrolist.music.api

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

@Serializable
data class ListenBrainzUser(
    val username: String,
)

object ListenBrainz {
    private const val API_ROOT = "https://api.listenbrainz.org/1"
    private const val SUBMISSION_CLIENT = "NrNMusic"

    private val json = Json { ignoreUnknownKeys = true }

    private val client by lazy {
        HttpClient(OkHttp)
    }

    suspend fun validateToken(token: String): Result<ListenBrainzUser> =
        runListenBrainzRequest {
            require(token.isNotBlank()) { "ListenBrainz token is empty" }
            val response =
                client.get("$API_ROOT/validate-token") {
                    header(HttpHeaders.Authorization, "Token $token")
                }
            val body = parseResponse(response.status.value, response.bodyAsText())
            val valid =
                body["valid"]?.jsonPrimitive?.booleanOrNull
                    ?: body["valid"]?.jsonPrimitive?.contentOrNull.equals("true", ignoreCase = true)
            check(valid) { "ListenBrainz token is invalid" }
            val username = body["user_name"]?.jsonPrimitive?.contentOrNull.orEmpty()
            check(username.isNotBlank()) { "ListenBrainz response is missing the username" }
            ListenBrainzUser(username)
        }

    suspend fun updateNowPlaying(
        token: String,
        artist: String,
        track: String,
        album: String? = null,
        duration: Int? = null,
    ): Result<Unit> = submit(token, "playing_now", artist, track, null, album, duration)

    suspend fun scrobble(
        token: String,
        artist: String,
        track: String,
        timestamp: Long,
        album: String? = null,
        duration: Int? = null,
    ): Result<Unit> = submit(token, "single", artist, track, timestamp, album, duration)

    private suspend fun submit(
        token: String,
        listenType: String,
        artist: String,
        track: String,
        timestamp: Long?,
        album: String?,
        duration: Int?,
    ): Result<Unit> =
        runListenBrainzRequest {
            require(token.isNotBlank()) { "ListenBrainz token is empty" }
            val metadata =
                buildJsonObject {
                    put("artist_name", artist)
                    put("track_name", track)
                    album?.let { put("release_name", it) }
                    put(
                        "additional_info",
                        buildJsonObject {
                            duration?.takeIf { it > 0 }?.let { put("duration_ms", it * 1000L) }
                            put("submission_client", SUBMISSION_CLIENT)
                        },
                    )
                }
            val listen =
                buildJsonObject {
                    timestamp?.let { put("listened_at", it) }
                    put("track_metadata", metadata)
                }
            val response =
                client.post("$API_ROOT/submit-listens") {
                    header(HttpHeaders.Authorization, "Token $token")
                    contentType(ContentType.Application.Json)
                    setBody(
                        buildJsonObject {
                            put("listen_type", listenType)
                            put("payload", buildJsonArray { add(listen) })
                        }.toString(),
                    )
                }
            val body = parseResponse(response.status.value, response.bodyAsText())
            check(body["status"]?.jsonPrimitive?.contentOrNull == "ok") {
                "ListenBrainz rejected the listen"
            }
        }

    private fun parseResponse(
        statusCode: Int,
        body: String,
    ) = runCatching { json.parseToJsonElement(body).jsonObject }
        .getOrElse {
            throw IllegalStateException("ListenBrainz returned an invalid response (HTTP $statusCode)", it)
        }.also { response ->
            if (statusCode !in 200..299) {
                val message =
                    response["error"]?.jsonPrimitive?.contentOrNull
                        ?: response["message"]?.jsonPrimitive?.contentOrNull
                throw IllegalStateException(message ?: "ListenBrainz request failed (HTTP $statusCode)")
            }
        }

    private suspend inline fun <T> runListenBrainzRequest(crossinline block: suspend () -> T): Result<T> =
        try {
            Result.success(block())
        } catch (error: CancellationException) {
            throw error
        } catch (error: Throwable) {
            Result.failure(error)
        }
}
