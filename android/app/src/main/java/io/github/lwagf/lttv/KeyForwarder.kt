package io.github.lwagf.lttv

/** Remote keys the WebView doesn't receive on its own; MainActivity forwards these to JS. */
object KeyForwarder {
    private val names = mapOf(
        82 to "menu", // KEYCODE_MENU
        85 to "playPause", // KEYCODE_MEDIA_PLAY_PAUSE
        126 to "playPause", // KEYCODE_MEDIA_PLAY
        127 to "playPause", // KEYCODE_MEDIA_PAUSE
        89 to "rewind", // KEYCODE_MEDIA_REWIND
        90 to "fastForward", // KEYCODE_MEDIA_FAST_FORWARD
        4 to "back", // KEYCODE_BACK
    )

    fun nameFor(keyCode: Int): String? = names[keyCode]

    /** Releases matter only for keys that can be held to scrub. */
    fun shouldForwardUp(keyCode: Int): Boolean = keyCode == 89 || keyCode == 90
}
