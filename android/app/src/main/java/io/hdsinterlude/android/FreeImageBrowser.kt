package io.hdsinterlude.android

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Dialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.util.Base64
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONTokener
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL
import java.util.concurrent.Executor

internal fun isFreeImagePage(value: String?): Boolean = runCatching {
    val uri = java.net.URI(value ?: "")
    uri.scheme == "https" && uri.host == "imagefree.net" && uri.userInfo == null && uri.port in listOf(-1, 443)
}.getOrDefault(false)

/** A separate, visible browser: no Capacitor/Android JS bridge is exposed to the website. */
internal class FreeImageBrowser(private val activity: Activity, private val io: Executor) {
    private var dialog: Dialog? = null
    fun close() { dialog?.dismiss() }

    @SuppressLint("SetJavaScriptEnabled")
    fun open(prompt: String, complete: (JSONObject) -> Unit) {
        check(dialog == null) { "免费生图页面已经打开" }
        val panel = Dialog(activity)
        val layout = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL; setPadding(16, 12, 16, 12) }
        val hint = TextView(activity).apply { text = "在免费网页完成验证并生成图片，然后点网页的 Download / 下载，图片会回到原任务。描述已准备好，可复制粘贴。"; setPadding(0, 8, 0, 12) }
        val web = WebView(activity)
        var finished = false
        var closed = false
        var downloading = false
        val controls = LinearLayout(activity)
        controls.addView(Button(activity).apply { text = "返回应用"; setOnClickListener { panel.dismiss() } })
        controls.addView(Button(activity).apply { text = "复制画面描述"; setOnClickListener {
            (activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("画面描述", prompt))
            hint.text = "描述已复制。粘贴到网页的 Prompt，生成完成后点 Download / 下载。"
        } })
        layout.addView(controls); layout.addView(hint)
        layout.addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        web.settings.apply { javaScriptEnabled = true; domStorageEnabled = true; allowFileAccess = false; allowContentAccess = false; mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW }
        val userAgent = web.settings.userAgentString
        fun fail() { if (!closed) { downloading = false; hint.text = "这次未能读取下载图片。可在网页重试下载，或返回应用后选择相册中已下载的图片。" } }
        fun accept(load: () -> ByteArray) {
            io.execute {
                try {
                    val bytes = load()
                    require(bytes.isNotEmpty() && bytes.size <= 16 * 1024 * 1024)
                    val file = File.createTempFile("hds-free-image-", ".image", activity.cacheDir)
                    val dataUri = try {
                        file.writeBytes(bytes)
                        AppearanceStore(activity).image(Uri.fromFile(file))
                    } finally { file.delete() }
                    activity.runOnUiThread { if (!closed) { finished = true; complete(JSONObject().put("cancelled", false).put("dataUri", dataUri)); panel.dismiss() } }
                } catch (_: Exception) { activity.runOnUiThread { fail() } }
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = request.isForMainFrame && !isFreeImagePage(request.url.toString())
            override fun onPageFinished(view: WebView, url: String) {
                if (!isFreeImagePage(url)) return
                // Fill only an empty prompt field. Verification and Generate remain user actions.
                view.evaluateJavascript("""(() => { const e = document.querySelector('textarea'); if (e && !e.value) { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(e, ${JSONObject.quote(prompt)}); e.dispatchEvent(new Event('input', {bubbles:true})); } })()""", null)
            }
        }
        web.setDownloadListener { address, _, _, _, length ->
            if (!isFreeImagePage(web.url) || downloading || closed) return@setDownloadListener
            if (length > 16 * 1024 * 1024) { fail(); return@setDownloadListener }
            downloading = true; hint.text = "正在读取图片，完成后会自动返回应用…"
            if (address.startsWith("blob:https://imagefree.net/") || address.startsWith("data:image/")) {
                // Read only the download selected by the user; never inspect cookies or verification tokens.
                web.evaluateJavascript("""(() => { window.__hdsImageDownload = null; fetch(${JSONObject.quote(address)}).then(r => r.blob()).then(b => { if (b.size > 16777216) throw Error(); const reader = new FileReader(); reader.onload = () => { window.__hdsImageDownload = reader.result }; reader.onerror = () => { window.__hdsImageDownload = 'error' }; reader.readAsDataURL(b); }).catch(() => { window.__hdsImageDownload = 'error' }); })()""", null)
                fun poll(remaining: Int) {
                    if (closed) return
                    web.evaluateJavascript("window.__hdsImageDownload") { encoded ->
                        if (closed) return@evaluateJavascript
                        val value = runCatching { JSONTokener(encoded).nextValue() as? String }.getOrNull()
                        if (value == null && remaining > 0) web.postDelayed({ poll(remaining - 1) }, 250)
                        else if (value != null && value.startsWith("data:image/") && value.length <= 23 * 1024 * 1024) {
                            web.evaluateJavascript("delete window.__hdsImageDownload", null)
                            accept { Base64.decode(value.substringAfter("base64,"), Base64.DEFAULT) }
                        } else fail()
                    }
                }
                poll(120)
            } else {
                val cookie = if (isFreeImagePage(address)) CookieManager.getInstance().getCookie(address) else null
                accept { download(address, userAgent, cookie) }
            }
        }
        panel.setContentView(layout)
        panel.setOnDismissListener { closed = true; web.stopLoading(); web.destroy(); dialog = null; if (!finished) complete(JSONObject().put("cancelled", true)) }
        dialog = panel; panel.show()
        panel.window?.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        web.loadUrl("https://imagefree.net/")
    }

    private fun download(address: String, userAgent: String, cookie: String?): ByteArray {
        var url = URL(address)
        repeat(6) {
            require(url.protocol == "https" && url.userInfo == null)
            require(InetAddress.getAllByName(url.host).all { !it.isAnyLocalAddress && !it.isLoopbackAddress && !it.isLinkLocalAddress && !it.isSiteLocalAddress && !it.isMulticastAddress })
            val connection = url.openConnection() as HttpURLConnection
            try {
                connection.instanceFollowRedirects = false; connection.connectTimeout = 20000; connection.readTimeout = 60000
                connection.setRequestProperty("User-Agent", userAgent)
                if (cookie != null && isFreeImagePage(url.toString())) connection.setRequestProperty("Cookie", cookie)
                if (connection.responseCode in listOf(301, 302, 303, 307, 308)) { url = URL(url, connection.getHeaderField("Location") ?: error("missing redirect")) }
                else {
                    require(connection.responseCode in 200..299 && connection.contentLengthLong <= 16 * 1024 * 1024)
                    return connection.inputStream.use { input ->
                        val output = ByteArrayOutputStream(); val block = ByteArray(8192)
                        while (true) { val n = input.read(block); if (n < 0) break; require(output.size() + n <= 16 * 1024 * 1024); output.write(block, 0, n) }
                        output.toByteArray()
                    }
                }
            } finally { connection.disconnect() }
        }
        error("too many redirects")
    }
}
