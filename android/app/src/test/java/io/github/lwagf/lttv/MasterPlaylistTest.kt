package io.github.lwagf.lttv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MasterPlaylistTest {
    @Test
    fun listsAbsoluteAndRelativeVariantUris() {
        val master = """
            #EXTM3U
            #EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="chunked",NAME="1080p60 (source)"
            #EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=1920x1080,VIDEO="chunked"
            https://edge.example/v1/playlist/aaa.m3u8
            #EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720
            720p.m3u8
        """.trimIndent()
        assertEquals(
            listOf("https://edge.example/v1/playlist/aaa.m3u8", "https://usher.example/hls/720p.m3u8"),
            MasterPlaylist.variantUris(master, "https://usher.example/hls/master.m3u8?sig=x"),
        )
    }

    @Test
    fun mediaPlaylistHasNoVariants() {
        assertTrue(MasterPlaylist.variantUris("#EXTM3U\n#EXTINF:2.0,\ns1.ts\n", "https://a/b.m3u8").isEmpty())
    }

    @Test
    fun skipsAudioOnlyVariants() {
        val master = """
            #EXTM3U
            #EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,VIDEO="720p30"
            720p.m3u8
            #EXT-X-STREAM-INF:BANDWIDTH=160000,CODECS="mp4a.40.2",VIDEO="audio_only"
            audio.m3u8
        """.trimIndent()
        assertEquals(
            listOf("https://usher.example/hls/720p.m3u8"),
            MasterPlaylist.variantUris(master, "https://usher.example/hls/master.m3u8"),
        )
    }
}
