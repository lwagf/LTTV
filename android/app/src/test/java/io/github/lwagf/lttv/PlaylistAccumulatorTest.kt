package io.github.lwagf.lttv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaylistAccumulatorTest {
    private fun playlist(
        from: Int,
        to: Int,
        discontinuitySeq: Int? = null,
        extraTags: Map<Int, String> = emptyMap(),
        prefetch: Boolean = false,
        endList: Boolean = false,
    ): String = buildString {
        appendLine("#EXTM3U")
        appendLine("#EXT-X-VERSION:3")
        appendLine("#EXT-X-TARGETDURATION:2")
        appendLine("#EXT-X-MEDIA-SEQUENCE:$from")
        if (discontinuitySeq != null) appendLine("#EXT-X-DISCONTINUITY-SEQUENCE:$discontinuitySeq")
        for (n in from..to) {
            extraTags[n]?.let { appendLine(it) }
            appendLine("#EXTINF:2.000,live")
            appendLine("s$n.ts")
        }
        if (prefetch) appendLine("#EXT-X-TWITCH-PREFETCH:https://edge/s${to + 1}.ts")
        if (endList) appendLine("#EXT-X-ENDLIST")
    }

    private fun uris(out: String) = out.lines().filter { it.endsWith(".ts") }

    private fun tag(out: String, name: String) =
        out.lines().firstOrNull { it.startsWith("$name:") }?.substringAfter(":")

    @Test
    fun firstMergeKeepsAllSegmentsAndStripsPrefetch() {
        val out = PlaylistAccumulator().merge(playlist(10, 14, prefetch = true))
        assertEquals((10..14).map { "s$it.ts" }, uris(out))
        assertFalse(out.contains("TWITCH-PREFETCH"))
        assertEquals("10", tag(out, "#EXT-X-MEDIA-SEQUENCE"))
    }

    @Test
    fun slidingWindowAccumulates() {
        val acc = PlaylistAccumulator()
        acc.merge(playlist(10, 14))
        val out = acc.merge(playlist(12, 16))
        assertEquals("10", tag(out, "#EXT-X-MEDIA-SEQUENCE"))
        assertEquals((10..16).map { "s$it.ts" }, uris(out))
    }

    @Test
    fun capTrimsOldest() {
        val out = PlaylistAccumulator(maxDurationSec = 6.0).merge(playlist(10, 14))
        assertEquals("12", tag(out, "#EXT-X-MEDIA-SEQUENCE"))
        assertEquals(listOf("s12.ts", "s13.ts", "s14.ts"), uris(out))
    }

    @Test
    fun trimmingADiscontinuityBumpsDiscontinuitySequence() {
        val out = PlaylistAccumulator(maxDurationSec = 8.0)
            .merge(playlist(10, 14, discontinuitySeq = 3, extraTags = mapOf(10 to "#EXT-X-DISCONTINUITY")))
        assertEquals("4", tag(out, "#EXT-X-DISCONTINUITY-SEQUENCE"))
        assertFalse(out.contains("#EXT-X-DISCONTINUITY\n"))
    }

    @Test
    fun adDaterangeTagsStayAttachedToTheirSegment() {
        val ad = "#EXT-X-DATERANGE:ID=\"stitched-ad-1\",CLASS=\"twitch-stitched-ad\""
        val acc = PlaylistAccumulator()
        acc.merge(playlist(10, 12, extraTags = mapOf(11 to ad)))
        val lines = acc.merge(playlist(11, 13)).lines()
        val i = lines.indexOf(ad)
        assertTrue(i >= 0)
        assertEquals("s11.ts", lines.drop(i).first { it.endsWith(".ts") })
    }

    @Test
    fun restartResets() {
        val acc = PlaylistAccumulator()
        acc.merge(playlist(100, 104))
        val out = acc.merge(playlist(0, 4))
        assertEquals("0", tag(out, "#EXT-X-MEDIA-SEQUENCE"))
        assertEquals((0..4).map { "s$it.ts" }, uris(out))
    }

    @Test
    fun endlistPreserved() {
        val out = PlaylistAccumulator().merge(playlist(1, 3, endList = true))
        assertEquals("#EXT-X-ENDLIST", out.trim().lines().last())
    }

    @Test
    fun defaultWindowIsFourMinutesBecauseTwitchExpiresSegmentsAfterAbout273s() {
        val out = PlaylistAccumulator().merge(playlist(0, 199))
        assertEquals(120, uris(out).size)
        assertEquals("80", tag(out, "#EXT-X-MEDIA-SEQUENCE"))
    }
}
