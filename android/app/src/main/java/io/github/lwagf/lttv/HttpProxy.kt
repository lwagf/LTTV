package io.github.lwagf.lttv

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.concurrent.Executors

/** HTTP for the few Twitch hosts the WebView can't reach directly because of CORS. */
object HttpProxy {
    private val allowedHosts = setOf("gql.twitch.tv", "id.twitch.tv", "usher.ttvnw.net")
    private val executor = Executors.newFixedThreadPool(4)

    fun isAllowed(url: String): Boolean {
        val uri = try {
            URI(url)
        } catch (e: Exception) {
            return false
        }
        return uri.scheme == "https" && uri.host in allowedHosts
    }

    fun register(bridge: NativeBridge) {
        bridge.register("http.request") { id, args ->
            val url = args.getString("url")
            if (!isAllowed(url)) {
                bridge.fail(id, "host not allowed: $url")
                return@register
            }
            executor.execute {
                try {
                    bridge.respond(id, request(url, args))
                } catch (e: Exception) {
                    bridge.fail(id, e.message ?: e.javaClass.simpleName)
                }
            }
        }
    }

    private fun request(url: String, args: JSONObject): JSONObject {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = args.optString("method", "GET")
            conn.connectTimeout = 10_000
            conn.readTimeout = 15_000
            val headers = args.optJSONObject("headers")
            headers?.keys()?.forEach { conn.setRequestProperty(it, headers.getString(it)) }
            if (args.has("body") && !args.isNull("body")) {
                conn.doOutput = true
                conn.outputStream.use { it.write(args.getString("body").toByteArray()) }
            }
            val status = conn.responseCode
            val stream = if (status >= 400) conn.errorStream else conn.inputStream
            val body = stream?.bufferedReader()?.use { it.readText() } ?: ""
            return JSONObject().put("status", status).put("body", body)
        } finally {
            conn.disconnect()
        }
    }
}
