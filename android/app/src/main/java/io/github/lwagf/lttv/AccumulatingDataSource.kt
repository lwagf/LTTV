package io.github.lwagf.lttv

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSourceUtil
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * Passes everything through except live media playlists, which it rewrites with a
 * [PlaylistAccumulator] (one per playlist path, so each quality keeps its own window).
 *
 * ExoPlayer only refreshes the quality it is playing, so the factory also polls the other video
 * variants (less often, and skipping whatever ExoPlayer just fetched); otherwise a quality switch
 * would land on a short window.
 */
@UnstableApi
class AccumulatingDataSource(
    private val upstream: DataSource,
    private val accumulators: MutableMap<String, PlaylistAccumulator>,
    private val factory: Factory,
) : DataSource {
    class Factory(private val upstream: DataSource.Factory) : DataSource.Factory {
        private val accumulators = mutableMapOf<String, PlaylistAccumulator>()
        private var poller: ScheduledExecutorService? = null
        internal val recentLoads = RecentLoads(POLL_SECONDS * 1000)

        override fun createDataSource(): DataSource =
            AccumulatingDataSource(upstream.createDataSource(), accumulators, this)

        @Synchronized
        internal fun pollVariants(uris: List<String>) {
            if (poller != null || uris.isEmpty()) return
            poller = Executors.newSingleThreadScheduledExecutor().apply {
                scheduleWithFixedDelay(
                    { uris.forEach(::refresh) }, POLL_SECONDS, POLL_SECONDS, TimeUnit.SECONDS,
                )
            }
        }

        private fun refresh(uri: String) {
            val path = Uri.parse(uri).path ?: return
            if (!recentLoads.isDue(path)) return
            recentLoads.mark(path)
            val source = upstream.createDataSource()
            try {
                source.open(DataSpec(Uri.parse(uri)))
                val text = DataSourceUtil.readToEnd(source).toString(Charsets.UTF_8)
                synchronized(accumulators) {
                    accumulators.getOrPut(path) { PlaylistAccumulator() }.merge(text)
                }
            } catch (e: Exception) {
                // A missed refresh only shortens that quality's rewind window.
            } finally {
                try {
                    source.close()
                } catch (e: Exception) {
                }
            }
        }

        @Synchronized
        fun release() {
            poller?.shutdownNow()
            poller = null
        }

        private companion object {
            // Twitch keeps ~15 two-second segments listed, so 20 s still overlaps.
            const val POLL_SECONDS = 20L
        }
    }

    private var buffer: ByteArray? = null
    private var offset = 0

    override fun addTransferListener(transferListener: TransferListener) =
        upstream.addTransferListener(transferListener)

    override fun open(dataSpec: DataSpec): Long {
        val length = upstream.open(dataSpec)
        val path = dataSpec.uri.path ?: ""
        if (!path.endsWith(".m3u8")) return length

        val text = DataSourceUtil.readToEnd(upstream).toString(Charsets.UTF_8)
        if (text.contains("#EXT-X-STREAM-INF")) {
            factory.pollVariants(MasterPlaylist.variantUris(text, dataSpec.uri.toString()))
        }
        val out = if (text.contains("#EXTINF")) {
            factory.recentLoads.mark(path)
            synchronized(accumulators) {
                accumulators.getOrPut(path) { PlaylistAccumulator() }.merge(text)
            }
        } else {
            text
        }
        buffer = out.toByteArray(Charsets.UTF_8)
        offset = 0
        return buffer!!.size.toLong()
    }

    override fun read(target: ByteArray, targetOffset: Int, length: Int): Int {
        val buf = buffer ?: return upstream.read(target, targetOffset, length)
        if (offset >= buf.size) return C.RESULT_END_OF_INPUT
        val n = minOf(length, buf.size - offset)
        System.arraycopy(buf, offset, target, targetOffset, n)
        offset += n
        return n
    }

    override fun getUri(): Uri? = upstream.uri

    override fun getResponseHeaders(): Map<String, List<String>> = upstream.responseHeaders

    override fun close() {
        buffer = null
        upstream.close()
    }
}
