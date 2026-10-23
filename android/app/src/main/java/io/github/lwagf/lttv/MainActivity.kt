package io.github.lwagf.lttv

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.media3.ui.PlayerView
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

class MainActivity : Activity() {
    lateinit var container: FrameLayout
    lateinit var webView: WebView
    lateinit var bridge: NativeBridge
    lateinit var playerController: PlayerController

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        container = FrameLayout(this)
        webView = WebView(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
        }
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest,
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
        }

        bridge = NativeBridge(webView)
        webView.addJavascriptInterface(bridge, "LTTVNative")
        bridge.register("app.info") { id, _ ->
            bridge.respond(id, JSONObject()
                .put("versionName", BuildConfig.VERSION_NAME)
                .put("webViewUserAgent", webView.settings.userAgentString))
        }
        bridge.register("app.exit") { id, _ ->
            bridge.respond(id, null)
            finish()
        }

        playerController = PlayerController(this, bridge)
        playerController.onPlayingChanged = { playing ->
            if (playing) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
        HttpProxy.register(bridge)
        val playerView = PlayerView(this).apply {
            useController = false
            setBackgroundColor(Color.BLACK)
            setShutterBackgroundColor(Color.BLACK)
            isFocusable = false
            player = playerController.player
        }

        container.addView(playerView, FrameLayout.LayoutParams(-1, -1))
        container.addView(webView, FrameLayout.LayoutParams(-1, -1))
        setContentView(container)
        // Debug builds can open another bundled page: `am start ... --es path <page>.html`.
        val path = intent.getStringExtra("path")?.takeIf { BuildConfig.DEBUG } ?: "index.html"
        webView.loadUrl("https://appassets.androidplatform.net/assets/web/$path")
        webView.requestFocus()
    }

    override fun onStart() {
        super.onStart()
        webView.onResume()
        webView.resumeTimers()
        playerController.resume()
    }

    // In the background nothing should keep talking to Twitch: no stream, chat or polling.
    override fun onStop() {
        super.onStop()
        playerController.suspend()
        webView.onPause()
        webView.pauseTimers()
    }

    override fun onDestroy() {
        playerController.release()
        webView.destroy()
        super.onDestroy()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val name = KeyForwarder.nameFor(event.keyCode) ?: return super.dispatchKeyEvent(event)
        if (event.action == KeyEvent.ACTION_DOWN) {
            bridge.emit("key", JSONObject().put("key", name).put("repeat", event.repeatCount > 0))
        } else if (event.action == KeyEvent.ACTION_UP && KeyForwarder.shouldForwardUp(event.keyCode)) {
            bridge.emit("keyUp", JSONObject().put("key", name))
        }
        return true
    }
}
