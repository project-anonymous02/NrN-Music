package com.nrnmusic.innertube.pages

import com.nrnmusic.innertube.models.YTItem

data class LibraryContinuationPage(
    val items: List<YTItem>,
    val continuation: String?,
)
