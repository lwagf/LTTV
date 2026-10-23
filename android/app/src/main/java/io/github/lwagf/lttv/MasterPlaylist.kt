package io.github.lwagf.lttv

import java.net.URI

object MasterPlaylist {
    /**
     * Video variant playlist URIs (resolved against [baseUri]) listed after each #EXT-X-STREAM-INF.
     * Audio-only variants have no RESOLUTION and are left out.
     */
    fun variantUris(text: String, baseUri: String): List<String> {
        val lines = text.lines().map { it.trim() }
        return lines.mapIndexedNotNull { i, line ->
            if (!line.startsWith("#EXT-X-STREAM-INF") || !line.contains("RESOLUTION=")) {
                return@mapIndexedNotNull null
            }
            val uri = lines.drop(i + 1).firstOrNull { it.isNotEmpty() && !it.startsWith("#") }
            uri?.let { URI(baseUri).resolve(it).toString() }
        }
    }
}
