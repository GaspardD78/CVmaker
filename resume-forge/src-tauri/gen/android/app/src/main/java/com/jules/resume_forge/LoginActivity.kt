package com.jules.resume_forge

import android.graphics.Bitmap
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Activity dédiée à la connexion utilisateur sur LinkedIn / Indeed / HelloWork.
 *
 * Pourquoi pas un navigateur externe ?
 *   - Les cookies posés dans Chrome/Firefox vivent dans LEUR cookie jar, pas
 *     dans celui de notre WebView. Le scraping ultérieur via iframe ne les
 *     verrait jamais → login inutile.
 *   - Une URL https vers linkedin.com déclenche les Android App Links et
 *     bascule sur l'app native, qui ne nous rend jamais la main.
 *
 * Solution : un WebView Android in-process. `CookieManager.getInstance()` est
 * un singleton partagé par toutes les WebView du process → les cookies posés
 * ici sont automatiquement disponibles pour `BackgroundScraper`.
 *
 * Anti-bypass App Links : `WebViewClient.shouldOverrideUrlLoading` retourne
 * toujours `false` → toutes les URLs (y compris les redirects post-login vers
 * /feed/) restent dans la WebView, jamais déléguées au système.
 */
class LoginActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_URL = "url"

        // User-Agent Chrome desktop : évite les murs « install our app » et
        // les pages mobiles qui poussent agressivement vers l'app native.
        private const val DESKTOP_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    }

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        val url = intent.getStringExtra(EXTRA_URL)
        if (url.isNullOrBlank()) {
            finish()
            return
        }

        val urlBar = findViewById<TextView>(R.id.login_url_bar)
        val closeBtn = findViewById<Button>(R.id.login_close_btn)
        webView = findViewById(R.id.login_webview)

        urlBar.text = url
        closeBtn.setOnClickListener { finishAndFlush() }

        configureWebView(webView)

        // Cookies tiers acceptés : indispensable pour les flux OAuth qui
        // posent des cookies sur des sous-domaines auth.* avant de revenir.
        val cm = CookieManager.getInstance()
        cm.setAcceptCookie(true)
        cm.setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                // Tout reste dans CETTE WebView. On ne laisse jamais Android
                // déléguer à une app externe (App Links LinkedIn/Indeed…).
                return false
            }

            override fun onPageStarted(view: WebView?, currentUrl: String?, favicon: Bitmap?) {
                urlBar.text = currentUrl ?: ""
            }

            override fun onPageFinished(view: WebView?, currentUrl: String?) {
                // Force la persistance des cookies sur disque après chaque page.
                CookieManager.getInstance().flush()
            }
        }

        webView.loadUrl(url)
    }

    private fun configureWebView(wv: WebView) {
        with(wv.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            userAgentString = DESKTOP_UA
            // useWideViewPort + loadWithOverviewMode : rendu desktop correct
            useWideViewPort = true
            loadWithOverviewMode = true
            // Cache standard du WebView : aide les redirects OAuth multi-étapes.
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = true
            // Mixed content autorisé sur HTTPS racine (rare mais certains
            // providers chargent des sous-ressources http).
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        }
        wv.visibility = View.VISIBLE
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            finishAndFlush()
        }
    }

    override fun onDestroy() {
        if (::webView.isInitialized) {
            webView.stopLoading()
            (webView.parent as? android.view.ViewGroup)?.removeView(webView)
            webView.destroy()
        }
        super.onDestroy()
    }

    private fun finishAndFlush() {
        CookieManager.getInstance().flush()
        finish()
    }
}
