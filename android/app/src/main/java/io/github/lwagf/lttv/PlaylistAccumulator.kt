package io.github.lwagf.lttv

/**
 * Grows a live HLS media playlist into a longer window (up to [maxDurationSec]) by remembering
 * segments Twitch has already dropped from its sliding window, so ExoPlayer can seek back through
 * what was watched since tuning in. Twitch deletes segments ~4.5 min after they air, hence the
 * 4-minute cap; older history plays from the broadcast's VOD (web liveTimeline.ts).
 */
class PlaylistAccumulator(private val maxDurationSec: Double = 240.0) {
    private class Segment(val seq: Long, val lines: List<String>, val duration: Double) {
        val discontinuity get() = lines.any { it == "#EXT-X-DISCONTINUITY" }
    }

    private val segments = ArrayDeque<Segment>()
    private var discontinuitySeq = 0L

    fun merge(playlist: String): String {
        val parsed = parse(playlist)
        val firstHeld = segments.firstOrNull()?.seq
        val nextExpected = segments.lastOrNull()?.seq?.plus(1)
        // A sequence that moved backwards (stream restart) or skipped ahead (we missed segments)
        // can't be stitched onto what we hold.
        if (firstHeld == null || parsed.mediaSeq < firstHeld || parsed.mediaSeq > nextExpected!!) {
            segments.clear()
            discontinuitySeq = parsed.discontinuitySeq
        }
        val newest = segments.lastOrNull()?.seq ?: Long.MIN_VALUE
        parsed.segments.filter { it.seq > newest }.forEach { segments.addLast(it) }

        var total = segments.sumOf { it.duration }
        while (total > maxDurationSec && segments.size > 1) {
            val dropped = segments.removeFirst()
            total -= dropped.duration
            if (dropped.discontinuity) discontinuitySeq++
        }
        return render(parsed)
    }

    private class Parsed(
        val header: List<String>,
        val mediaSeq: Long,
        val discontinuitySeq: Long,
        val segments: List<Segment>,
        val endList: Boolean,
    )

    private fun parse(text: String): Parsed {
        val header = mutableListOf<String>()
        val segments = mutableListOf<Segment>()
        var mediaSeq = 0L
        var discSeq = 0L
        var endList = false
        var pending = mutableListOf<String>()
        var inSegments = false

        for (raw in text.lines()) {
            val line = raw.trim()
            if (line.isEmpty() || line.startsWith("#EXT-X-TWITCH-PREFETCH")) continue
            when {
                line.startsWith("#EXT-X-MEDIA-SEQUENCE:") -> mediaSeq = line.substringAfter(':').toLong()
                line.startsWith("#EXT-X-DISCONTINUITY-SEQUENCE:") ->
                    discSeq = line.substringAfter(':').toLong()
                line.startsWith("#EXT-X-PLAYLIST-TYPE") -> Unit
                line == "#EXT-X-ENDLIST" -> endList = true
                !line.startsWith("#") -> {
                    pending.add(line)
                    val duration = pending.firstOrNull { it.startsWith("#EXTINF:") }
                        ?.substringAfter(':')?.substringBefore(',')?.toDoubleOrNull() ?: 0.0
                    segments.add(Segment(mediaSeq + segments.size, pending, duration))
                    pending = mutableListOf()
                }
                inSegments || SEGMENT_TAGS.any { line.startsWith(it) } -> {
                    inSegments = true
                    pending.add(line)
                }
                else -> header.add(line)
            }
        }
        return Parsed(header, mediaSeq, discSeq, segments, endList)
    }

    private fun render(parsed: Parsed): String = buildString {
        for (line in parsed.header) appendLine(line)
        appendLine("#EXT-X-MEDIA-SEQUENCE:${segments.firstOrNull()?.seq ?: parsed.mediaSeq}")
        appendLine("#EXT-X-DISCONTINUITY-SEQUENCE:$discontinuitySeq")
        for (segment in segments) segment.lines.forEach { appendLine(it) }
        if (parsed.endList) appendLine("#EXT-X-ENDLIST")
    }

    private companion object {
        val SEGMENT_TAGS = listOf(
            "#EXTINF", "#EXT-X-PROGRAM-DATE-TIME", "#EXT-X-DISCONTINUITY", "#EXT-X-DATERANGE",
            "#EXT-X-BYTERANGE", "#EXT-X-KEY", "#EXT-X-MAP", "#EXT-X-GAP", "#EXT-X-BITRATE",
        )
    }
}
