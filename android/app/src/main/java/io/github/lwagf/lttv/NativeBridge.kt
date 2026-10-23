package io.github.lwagf.lttv

import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject

/**
 * JSON message bridge to the web app (contract: web/src/native/protocol.ts).
 * JS calls post(); handlers answer via respond()/fail(); emit() pushes events.
 */
class NativeBridge(private val webView: WebView) {
    fun interface Handler {
        fun handle(id: Int?, args: JSONObject)
    }

    private val handlers = mutableMapOf<String, Handler>()

    fun register(cmd: String, handler: Handler) {
        handlers[cmd] = handler
    }

    @JavascriptInterface
    fun post(json: String) {
        val msg = JSONObject(json)
        val id = if (msg.has("id")) msg.getInt("id") else null
        val cmd = msg.getString("cmd")
        val args = msg.optJSONObject("args") ?: JSONObject()
        // JavascriptInterface calls arrive on a binder thread; run handlers on the main thread.
        webView.post {
            val handler = handlers[cmd]
            if (handler == null) {
                if (id != null) fail(id, "unknown command: $cmd")
                return@post
            }
            try {
                handler.handle(id, args)
            } catch (e: Exception) {
                if (id != null) fail(id, e.message ?: e.javaClass.simpleName)
            }
        }
    }

    fun respond(id: Int?, result: Any?) {
        if (id == null) return
        send(JSONObject().put("type", "response").put("id", id).put("ok", true)
            .put("result", result ?: JSONObject.NULL))
    }

    fun fail(id: Int?, error: String) {
        if (id == null) return
        send(JSONObject().put("type", "response").put("id", id).put("ok", false).put("error", error))
    }

    fun emit(event: String, data: JSONObject) {
        send(JSONObject().put("type", "event").put("event", event).put("data", data))
    }

    private fun send(msg: JSONObject) {
        // JSONObject.quote produces a valid JS string literal for the payload.
        val js = "window.__lttv && window.__lttv.onNative(${JSONObject.quote(msg.toString())})"
        webView.post { webView.evaluateJavascript(js, null) }
    }
}
