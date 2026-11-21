/**
 * Metrolist Project (C) 2026
 * Licensed under GPL-3.0 | See git history for contributors
 */

package com.nrnmusic.music.utils

import com.nrnmusic.lastfm.LastFM
import com.nrnmusic.music.api.ListenBrainz
import com.nrnmusic.music.models.MediaMetadata
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.min

class ScrobbleManager(
    private val scope: CoroutineScope,
    var minSongDuration: Int = 30,
    var scrobbleDelayPercent: Float = 0.5f,
    var scrobbleDelaySeconds: Int = 50
) {
    private var scrobbleJob: Job? = null
    private var scrobbleRemainingMillis: Long = 0L
    private var scrobbleTimerStartedAt: Long = 0L
    private var songStartedAt: Long = 0L
    private var songStarted = false
    var useNowPlaying = true
    var scrobbleToLastFm = true
    var scrobbleToListenBrainz = false
    var listenBrainzToken: String? = null
    var listenBrainzUseNowPlaying = true

    fun destroy() {
        scrobbleJob?.cancel()
        scrobbleRemainingMillis = 0L
        scrobbleTimerStartedAt = 0L
        songStartedAt = 0L
        songStarted = false
    }

    fun onSongStart(metadata: MediaMetadata?, duration: Long? = null) {
        if (metadata == null) return
        songStartedAt = System.currentTimeMillis() / 1000
        songStarted = true
        startScrobbleTimer(metadata, duration)
        if (shouldSendNowPlaying()) {
            updateNowPlaying(metadata)
        }
    }

    fun onSongResume(metadata: MediaMetadata) {
        resumeScrobbleTimer(metadata)
    }

    fun onSongPause() {
        pauseScrobbleTimer()
    }

    fun onSongStop() {
        stopScrobbleTimer()
        songStarted = false
    }

    private fun startScrobbleTimer(metadata: MediaMetadata, duration: Long? = null) {
        scrobbleJob?.cancel()
        val duration = duration?.toInt()?.div(1000) ?: metadata.duration

        if (duration <= minSongDuration) return

        val threshold = duration * 1000L * scrobbleDelayPercent
        scrobbleRemainingMillis = min(threshold.toLong(), scrobbleDelaySeconds * 1000L)

        if (scrobbleRemainingMillis <= 0) {
            scrobbleSong(metadata)
            return
        }
        scrobbleTimerStartedAt = System.currentTimeMillis()
        scrobbleJob = scope.launch {
            delay(scrobbleRemainingMillis)
            scrobbleSong(metadata)
            scrobbleJob = null
        }
    }

    private fun pauseScrobbleTimer() {
        scrobbleJob?.cancel()
        if (scrobbleTimerStartedAt != 0L) {
            val elapsed = System.currentTimeMillis() - scrobbleTimerStartedAt
            scrobbleRemainingMillis -= elapsed
            if (scrobbleRemainingMillis < 0) scrobbleRemainingMillis = 0
            scrobbleTimerStartedAt = 0L
        } else {
        }
    }

    private fun resumeScrobbleTimer(metadata: MediaMetadata) {
        if (scrobbleRemainingMillis <= 0) return
        scrobbleJob?.cancel()
        scrobbleTimerStartedAt = System.currentTimeMillis()
        scrobbleJob = scope.launch {
            delay(scrobbleRemainingMillis)
            scrobbleSong(metadata)
            scrobbleJob = null
        }
    }

    private fun stopScrobbleTimer() {
        scrobbleJob?.cancel()
        scrobbleJob = null
        scrobbleRemainingMillis = 0
    }

    private fun shouldSendNowPlaying(): Boolean =
        (scrobbleToLastFm && useNowPlaying) ||
            (scrobbleToListenBrainz && listenBrainzUseNowPlaying && !listenBrainzToken.isNullOrBlank())

    private fun scrobbleSong(metadata: MediaMetadata) {
        val artist = metadata.artists.joinToString { it.name }
        if (scrobbleToLastFm) {
            scope.launch {
                LastFM.scrobble(
                    artist = artist,
                    track = metadata.title,
                    duration = metadata.duration,
                    timestamp = songStartedAt,
                    album = metadata.album?.title,
                )
            }
        }
        val token = listenBrainzToken
        if (scrobbleToListenBrainz && !token.isNullOrBlank()) {
            scope.launch {
                ListenBrainz.scrobble(
                    token = token,
                    artist = artist,
                    track = metadata.title,
                    duration = metadata.duration,
                    timestamp = songStartedAt,
                    album = metadata.album?.title,
                )
            }
        }
    }

    private fun updateNowPlaying(metadata: MediaMetadata) {
        val artist = metadata.artists.joinToString { it.name }
        if (scrobbleToLastFm && useNowPlaying) {
            scope.launch {
                LastFM.updateNowPlaying(
                    artist = artist,
                    track = metadata.title,
                    album = metadata.album?.title,
                    duration = metadata.duration
                )
            }
        }
        val token = listenBrainzToken
        if (scrobbleToListenBrainz && listenBrainzUseNowPlaying && !token.isNullOrBlank()) {
            scope.launch {
                ListenBrainz.updateNowPlaying(
                    token = token,
                    artist = artist,
                    track = metadata.title,
                    album = metadata.album?.title,
                    duration = metadata.duration
                )
            }
        }
    }

    fun onPlayerStateChanged(isPlaying: Boolean, metadata: MediaMetadata?, duration: Long? = null) {
        if (metadata == null) return
        if (isPlaying) {
            if (!songStarted) {
                onSongStart(metadata, duration)
            } else {
                onSongResume(metadata)
            }
        } else {
            onSongPause()
        }
    }
}
