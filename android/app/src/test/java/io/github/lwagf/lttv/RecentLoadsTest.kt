package io.github.lwagf.lttv

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RecentLoadsTest {
    @Test
    fun aPathThePlayerJustLoadedIsNotDue() {
        val loads = RecentLoads(windowMs = 20_000)
        loads.mark("/v1/720p.m3u8", nowMs = 1_000)
        assertFalse(loads.isDue("/v1/720p.m3u8", nowMs = 15_000))
    }

    @Test
    fun aPathIsDueOnceTheWindowPasses() {
        val loads = RecentLoads(windowMs = 20_000)
        loads.mark("/v1/720p.m3u8", nowMs = 1_000)
        assertTrue(loads.isDue("/v1/720p.m3u8", nowMs = 21_000))
    }

    @Test
    fun anUnseenPathIsDue() {
        assertTrue(RecentLoads(windowMs = 20_000).isDue("/v1/480p.m3u8", nowMs = 0))
    }
}
