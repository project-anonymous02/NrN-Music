package com.nrnmusic.innertube.pages

import com.nrnmusic.innertube.models.SongItem

data class PlaylistContinuationPage(
    val songs: List<SongItem>,
    val continuation: String?,
)
