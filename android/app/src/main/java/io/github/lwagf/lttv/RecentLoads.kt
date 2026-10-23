package io.github.lwagf.lttv

/** When each playlist path was last fetched, so the poller can skip ones ExoPlayer is refreshing. */
class RecentLoads(private val windowMs: Long) {
    private val lastLoaded = mutableMapOf<String, Long>()

    @Synchronized
    fun mark(path: String, nowMs: Long = System.currentTimeMillis()) {
        lastLoaded[path] = nowMs
    }

    @Synchronized
    fun isDue(path: String, nowMs: Long = System.currentTimeMillis()): Boolean {
        val last = lastLoaded[path] ?: return true
        return nowMs - last >= windowMs
    }
}
