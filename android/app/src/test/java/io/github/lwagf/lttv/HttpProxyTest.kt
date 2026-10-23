package io.github.lwagf.lttv

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HttpProxyTest {
    @Test
    fun allowsTwitchGqlAndOauthOverHttps() {
        assertTrue(HttpProxy.isAllowed("https://gql.twitch.tv/gql"))
        assertTrue(HttpProxy.isAllowed("https://id.twitch.tv/oauth2/device"))
    }

    @Test
    fun allowsUsherBecauseItsSuccessResponsesLackCors() {
        assertTrue(HttpProxy.isAllowed("https://usher.ttvnw.net/api/channel/hls/x.m3u8?sig=a"))
    }

    @Test
    fun rejectsPlainHttp() {
        assertFalse(HttpProxy.isAllowed("http://gql.twitch.tv/gql"))
    }

    @Test
    fun rejectsOtherHosts() {
        assertFalse(HttpProxy.isAllowed("https://evil.example/gql"))
        assertFalse(HttpProxy.isAllowed("https://gql.twitch.tv.evil.example/"))
        assertFalse(HttpProxy.isAllowed("not a url"))
    }
}
