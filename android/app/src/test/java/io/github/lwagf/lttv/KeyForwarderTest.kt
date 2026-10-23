package io.github.lwagf.lttv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class KeyForwarderTest {
    @Test
    fun mapsRemoteKeys() {
        assertEquals("menu", KeyForwarder.nameFor(82))
        assertEquals("playPause", KeyForwarder.nameFor(85))
        assertEquals("rewind", KeyForwarder.nameFor(89))
        assertEquals("fastForward", KeyForwarder.nameFor(90))
        assertEquals("back", KeyForwarder.nameFor(4))
    }

    @Test
    fun leavesDpadToWebView() {
        assertNull(KeyForwarder.nameFor(19))
    }

    @Test
    fun forwardsReleaseOnlyForMediaKeys() {
        assertEquals(true, KeyForwarder.shouldForwardUp(89))
        assertEquals(true, KeyForwarder.shouldForwardUp(90))
        assertEquals(false, KeyForwarder.shouldForwardUp(4))
        assertEquals(false, KeyForwarder.shouldForwardUp(82))
    }
}
