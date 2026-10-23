package io.github.lwagf.lttv

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.HttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import org.json.JSONArray
import org.json.JSONObject

@androidx.annotation.OptIn(UnstableApi::class)
/** Owns the ExoPlayer instance and implements the `player.*` bridge commands and events. */
class PlayerController(context: Context, private val bridge: NativeBridge) {
    val player: ExoPlayer = ExoPlayer.Builder(context).build()
    private val handler = Handler(Looper.getMainLooper())
    private val httpFactory = DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(true)
    private var quality: Any = "auto"
    private var droppedFrames = 0L
    private var loaded = false
    private var liveSources: AccumulatingDataSource.Factory? = null
    private var isLive = false
    private var suspended = false
    /** VOD start position, applied once the timeline is ready. In-progress VODs are EVENT
     *  playlists that ExoPlayer treats as live and would otherwise start near the end. */
    private var pendingVodStartMs: Long? = null

    /** MainActivity keeps the screen awake while this reports true, so the screensaver stays off. */
    var onPlayingChanged: (Boolean) -> Unit = {}

    init {
        player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_READY) {
                    pendingVodStartMs?.let { player.seekTo(it) }
                    pendingVodStartMs = null
                }
                emitState(null)
            }
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                onPlayingChanged(isPlaying)
                emitState(null)
            }
            override fun onPlayerError(error: PlaybackException) {
                // After a long pause the position falls out of the live window; jump back to live.
                if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
                    player.seekToDefaultPosition()
                    player.prepare()
                    return
                }
                emitState(error)
            }
            override fun onTracksChanged(tracks: Tracks) = emitQualities(tracks)
        })
        player.addAnalyticsListener(object : AnalyticsListener {
            override fun onDroppedVideoFrames(
                eventTime: AnalyticsListener.EventTime,
                count: Int,
                elapsedMs: Long,
            ) {
                droppedFrames += count
            }
        })
        register()
    }

    private fun register() {
        bridge.register("player.load") { id, args ->
            load(
                args.getString("url"),
                args.getBoolean("isLive"),
                args.optLong("startPositionMs", 0),
                progressive = args.optString("format", "hls") == "progressive",
                loop = args.optBoolean("loop", false),
            )
            bridge.respond(id, null)
        }
        bridge.register("player.play") { id, _ -> player.play(); bridge.respond(id, null) }
        bridge.register("player.pause") { id, _ -> player.pause(); bridge.respond(id, null) }
        bridge.register("player.stop") { id, _ -> stop(); bridge.respond(id, null) }
        bridge.register("player.seekToLive") { id, _ ->
            recoverFromError()
            player.seekToDefaultPosition()
            player.play()
            bridge.respond(id, null)
        }
        bridge.register("player.seekBy") { id, args ->
            recoverFromError()
            player.seekTo((player.currentPosition + args.getLong("deltaMs")).coerceAtLeast(0))
            bridge.respond(id, null)
        }
        bridge.register("player.setMuted") { id, args ->
            player.volume = if (args.getBoolean("muted")) 0f else 1f
            bridge.respond(id, null)
        }
        bridge.register("player.setQuality") { id, args ->
            setQuality(args.get("quality"))
            bridge.respond(id, null)
        }
    }

    private fun load(
        url: String,
        isLive: Boolean,
        startPositionMs: Long,
        progressive: Boolean,
        loop: Boolean,
    ) {
        // A fresh accumulator set per load, so switching channels never mixes playlists.
        this.isLive = isLive
        suspended = false
        liveSources?.release()
        liveSources = if (isLive) AccumulatingDataSource.Factory(httpFactory) else null
        val factory: DataSource.Factory = liveSources ?: httpFactory
        val item = MediaItem.fromUri(url)
        val source = if (progressive) {
            ProgressiveMediaSource.Factory(factory).createMediaSource(item)
        } else {
            HlsMediaSource.Factory(factory).createMediaSource(item)
        }
        player.repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
        droppedFrames = 0
        pendingVodStartMs = if (isLive) null else startPositionMs
        player.setMediaSource(source, if (isLive) C.TIME_UNSET else startPositionMs)
        player.prepare()
        player.playWhenReady = true
        if (!loaded) {
            loaded = true
            handler.post(progressTick)
            handler.post(statsTick)
        }
    }

    /** After an error ExoPlayer stays idle until prepared again. */
    private fun recoverFromError() {
        if (player.playerError != null) player.prepare()
    }

    private fun stop() {
        liveSources?.release()
        liveSources = null
        player.stop()
        player.clearMediaItems()
        loaded = false
        suspended = false
        handler.removeCallbacks(progressTick)
        handler.removeCallbacks(statsTick)
    }

    private fun setQuality(q: Any) {
        quality = q
        val builder = player.trackSelectionParameters.buildUpon()
        if (q is JSONObject) {
            builder.setMaxVideoSize(Int.MAX_VALUE, q.getInt("maxHeight")).setForceHighestSupportedBitrate(true)
        } else {
            builder.clearVideoSizeConstraints().setForceHighestSupportedBitrate(false)
        }
        player.trackSelectionParameters = builder.build()
        emitQualities(player.currentTracks)
    }

    private fun emitState(error: PlaybackException?) {
        val state = when (player.playbackState) {
            Player.STATE_BUFFERING -> "buffering"
            Player.STATE_READY -> "ready"
            Player.STATE_ENDED -> "ended"
            else -> "idle"
        }
        val err = error ?: player.playerError
        val httpStatus = generateSequence(err as Throwable?) { it.cause }
            .filterIsInstance<HttpDataSource.InvalidResponseCodeException>()
            .firstOrNull()?.responseCode
        bridge.emit("player.state", JSONObject()
            .put("state", state)
            .put("playing", player.isPlaying)
            .put("error", err?.errorCodeName ?: JSONObject.NULL)
            .put("httpStatus", httpStatus ?: JSONObject.NULL))
    }

    private fun emitQualities(tracks: Tracks) {
        val list = JSONArray()
        val seen = mutableSetOf<Pair<Int, Int>>()
        for (group in tracks.groups) {
            if (group.type != C.TRACK_TYPE_VIDEO) continue
            for (i in 0 until group.length) {
                val f = group.getTrackFormat(i)
                if (f.height <= 0) continue
                val fps = if (f.frameRate > 0) Math.round(f.frameRate) else 30
                if (!seen.add(f.height to fps)) continue
                list.put(JSONObject().put("height", f.height).put("frameRate", fps).put("bitrate", f.bitrate))
            }
        }
        bridge.emit("player.qualities", JSONObject().put("list", list).put("selected", quality))
    }

    private val progressTick = object : Runnable {
        override fun run() {
            val isLive = player.isCurrentMediaItemLive
            // For live this is the rewindable window (what the playlist accumulator has kept).
            val duration = player.duration.takeIf { it != C.TIME_UNSET }
            var behind: Long? = null
            if (isLive) {
                val offset = player.currentLiveOffset
                val window = player.currentTimeline.takeIf { !it.isEmpty }
                    ?.getWindow(player.currentMediaItemIndex, androidx.media3.common.Timeline.Window())
                val target = window?.liveConfiguration?.targetOffsetMs ?: 0
                if (offset != C.TIME_UNSET) behind = (offset - target).coerceAtLeast(0)
            }
            bridge.emit("player.progress", JSONObject()
                .put("positionMs", player.currentPosition)
                .put("durationMs", duration ?: JSONObject.NULL)
                .put("isLive", isLive)
                .put("behindLiveMs", behind ?: JSONObject.NULL))
            handler.postDelayed(this, 500)
        }
    }

    private val statsTick = object : Runnable {
        override fun run() {
            val f = player.videoFormat
            bridge.emit("player.stats", JSONObject()
                .put("droppedFrames", droppedFrames)
                .put("videoHeight", f?.height ?: 0)
                .put("videoFrameRate", f?.frameRate?.takeIf { it > 0 }?.let { Math.round(it) } ?: 0))
            handler.postDelayed(this, 2000)
        }
    }

    /** The app went to the background: pause and stop loading, keeping the item to resume. */
    fun suspend() {
        player.pause()
        if (!loaded || suspended) return
        suspended = true
        liveSources?.release()
        player.stop()
        handler.removeCallbacks(progressTick)
        handler.removeCallbacks(statsTick)
    }

    /** Back in the foreground: reload what was playing (live rejoins at the live edge), paused. */
    fun resume() {
        if (!suspended) return
        suspended = false
        if (isLive) player.seekToDefaultPosition()
        player.prepare()
        handler.post(progressTick)
        handler.post(statsTick)
    }

    fun release() {
        stop()
        player.release()
    }
}
