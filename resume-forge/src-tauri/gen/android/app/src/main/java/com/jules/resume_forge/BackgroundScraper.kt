package com.jules.resume_forge

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/**
 * Scraper Android : charge une URL dans une WebView offscreen et renvoie le
 * HTML rendu après exécution du JavaScript de la page.
 *
 * Pourquoi pas une iframe côté JS ?
 *   LinkedIn / Indeed / HelloWork envoient `X-Frame-Options: DENY` (et CSP
 *   `frame-ancestors 'none'`) — l'iframe est bloquée par le navigateur, et
 *   même si elle chargeait, l'accès `iframe.contentDocument` cross-origin
 *   léverait `SecurityError`. Une WebView Android n'a pas ces contraintes :
 *   c'est notre propre instance, le DOM nous appartient.
 *
 * Cookies partagés : `CookieManager.getInstance()` est un singleton process-
 * wide ; les cookies posés par `LoginActivity` sont automatiquement utilisés
 * ici (et inversement).
 *
 * Synchronisation : `scrapePageBlocking` poste la création WebView sur le
 * main thread (obligatoire), attend le résultat via `CompletableFuture`, et
 * renvoie. Le caller (Rust) s'exécute sur un worker thread async — il faut
 * donc appeler depuis un `spawn_blocking` côté Tauri pour ne pas bloquer le
 * runtime tokio.
 */
object BackgroundScraper {

    private const val DESKTOP_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

    /** Délai de grâce (ms) pour le rendu JS après onPageFinished sans sélecteur. */
    private const val POST_LOAD_GRACE_MS = 3_000L

    /** Délai de grâce (ms) après détection du sélecteur, pour finir le rendu. */
    private const val POST_SELECTOR_GRACE_MS = 1_000L

    /** Période de polling (ms) du sélecteur via evaluateJavascript. */
    private const val SELECTOR_POLL_INTERVAL_MS = 500L

    /**
     * Charge `url` dans une WebView, attend le rendu JS, puis renvoie le HTML.
     *
     * @param context appelée depuis JNI : application context du process.
     * @param url URL à charger.
     * @param waitSelector si non-null, on attend que `document.querySelector(selector)`
     *                    renvoie un nœud avant d'extraire le HTML (avec un délai de
     *                    grâce). Sinon on attend simplement `onPageFinished` + 3 s.
     * @param timeoutSecs hard timeout global. Si dépassé, on extrait quand même
     *                    le HTML disponible (best-effort).
     * @param userAgent UA à utiliser (par défaut un Chrome desktop crédible).
     * @return HTML de la page, ou chaîne vide en cas d'échec catastrophique.
     */
    @JvmStatic
    fun scrapePageBlocking(
        context: Context,
        url: String,
        waitSelector: String?,
        timeoutSecs: Long,
        userAgent: String?,
    ): String {
        val future = CompletableFuture<String>()
        val mainHandler = Handler(Looper.getMainLooper())

        // Toute la manipulation de WebView doit avoir lieu sur le main thread.
        mainHandler.post {
            try {
                runScrape(context, url, waitSelector, timeoutSecs, userAgent, future, mainHandler)
            } catch (e: Throwable) {
                future.complete("")
            }
        }

        return try {
            // +2 s de marge sur le timeout côté JNI : le main thread doit avoir le
            // temps de poster `extract()` puis de remplir le future. Sans cette
            // marge, on retourne avant même d'avoir laissé une chance au scraper.
            future.get(timeoutSecs + 2, TimeUnit.SECONDS)
        } catch (e: TimeoutException) {
            ""
        } catch (e: Exception) {
            ""
        }
    }

    private fun runScrape(
        context: Context,
        url: String,
        waitSelector: String?,
        timeoutSecs: Long,
        userAgent: String?,
        future: CompletableFuture<String>,
        mainHandler: Handler,
    ) {
        val webView = WebView(context.applicationContext)
        configureWebView(webView, userAgent)

        // CookieManager est un singleton ; les cookies de LoginActivity sont
        // déjà disponibles ici. setAcceptCookie/setAcceptThirdPartyCookies
        // doivent quand même être actifs pour CETTE WebView.
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        // État partagé entre les callbacks : extraction unique, garde anti-double.
        val extracted = java.util.concurrent.atomic.AtomicBoolean(false)

        val extractAndFinish = extract@{
            if (!extracted.compareAndSet(false, true)) return@extract
            // evaluateJavascript renvoie une chaîne JSON (entourée de guillemets,
            // contenu déséchappé via JSON.parse). On utilise org.json pour décoder
            // proprement les escapes \uXXXX, \n, \", \\ etc.
            webView.evaluateJavascript(
                "(function(){try{return document.documentElement?document.documentElement.outerHTML:'';}catch(e){return '';}})();"
            ) { jsonResult ->
                val html = unescapeJsonStringLiteral(jsonResult)
                cleanupWebView(webView)
                future.complete(html)
            }
        }

        webView.webViewClient = object : WebViewClient() {
            // On garde tout dans CETTE WebView : pas de délégation à une app native.
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?) = false

            override fun onPageFinished(view: WebView?, finishedUrl: String?) {
                CookieManager.getInstance().flush()

                if (waitSelector.isNullOrBlank()) {
                    mainHandler.postDelayed({ extractAndFinish() }, POST_LOAD_GRACE_MS)
                } else {
                    pollForSelector(webView, waitSelector, mainHandler, extractAndFinish, attemptsLeft = computePollAttempts(timeoutSecs))
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: android.webkit.WebResourceError?,
            ) {
                // On ignore les erreurs sur sous-ressources (favicon, analytics, …).
                // Seule une erreur sur le main frame doit nous faire abandonner.
                val isMainFrame = request?.isForMainFrame ?: false
                if (isMainFrame) {
                    if (extracted.compareAndSet(false, true)) {
                        cleanupWebView(webView)
                        future.complete("")
                    }
                }
            }
        }

        // Hard timeout : on extrait le HTML disponible juste avant que le caller
        // n'abandonne. Mieux vaut renvoyer une page partielle qu'une chaîne vide.
        mainHandler.postDelayed({
            if (!extracted.get()) extractAndFinish()
        }, timeoutSecs * 1000)

        webView.loadUrl(url)
    }

    private fun configureWebView(wv: WebView, userAgent: String?) {
        with(wv.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            userAgentString = userAgent ?: DESKTOP_UA
            useWideViewPort = true
            loadWithOverviewMode = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            // Désactivé pour ne pas zoomer accidentellement durant le rendu.
            builtInZoomControls = false
            displayZoomControls = false
        }
    }

    private fun cleanupWebView(wv: WebView) {
        try {
            wv.stopLoading()
            wv.webViewClient = WebViewClient()
            wv.loadUrl("about:blank")
            wv.clearHistory()
            wv.removeAllViews()
            wv.destroy()
        } catch (_: Throwable) {
            // Best-effort cleanup ; un échec ici ne doit pas masquer le HTML extrait.
        }
    }

    /**
     * Calcule le nombre max de tentatives de polling du sélecteur en se basant
     * sur le timeout global (en gardant une marge pour l'extraction finale).
     */
    private fun computePollAttempts(timeoutSecs: Long): Int {
        // -2 s pour laisser le hard-timeout se déclencher en dernier recours.
        val budgetMs = (timeoutSecs - 2).coerceAtLeast(2) * 1000
        return (budgetMs / SELECTOR_POLL_INTERVAL_MS).toInt().coerceAtLeast(1)
    }

    private fun pollForSelector(
        webView: WebView,
        selector: String,
        mainHandler: Handler,
        onFound: () -> Unit,
        attemptsLeft: Int,
    ) {
        val script = "!!document.querySelector(${jsonEscape(selector)})"
        webView.evaluateJavascript(script) { result ->
            if (result == "true") {
                // Un peu de marge pour que le contenu autour du sélecteur soit aussi rendu.
                mainHandler.postDelayed(onFound, POST_SELECTOR_GRACE_MS)
            } else if (attemptsLeft > 0) {
                mainHandler.postDelayed(
                    { pollForSelector(webView, selector, mainHandler, onFound, attemptsLeft - 1) },
                    SELECTOR_POLL_INTERVAL_MS,
                )
            } else {
                // Sélecteur jamais trouvé : on extrait quand même, le parser TS décidera.
                onFound()
            }
        }
    }

    /** Échappe une string JS pour l'utiliser comme littéral entre guillemets. */
    private fun jsonEscape(s: String): String {
        val sb = StringBuilder("\"")
        for (ch in s) {
            when (ch) {
                '\\' -> sb.append("\\\\")
                '"'  -> sb.append("\\\"")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                else -> sb.append(ch)
            }
        }
        sb.append("\"")
        return sb.toString()
    }

    /**
     * `WebView.evaluateJavascript` renvoie le résultat sous forme de littéral
     * JSON (chaîne entourée de guillemets, contenu déséchappé). On utilise
     * `org.json.JSONTokener` pour parser proprement, qui gère \uXXXX, \", etc.
     */
    private fun unescapeJsonStringLiteral(jsonResult: String?): String {
        if (jsonResult.isNullOrEmpty() || jsonResult == "null") return ""
        return try {
            val parsed = org.json.JSONTokener(jsonResult).nextValue()
            if (parsed is String) parsed else ""
        } catch (_: Throwable) {
            // Fallback : retire les guillemets externes si le parsing échoue.
            if (jsonResult.length >= 2 && jsonResult.startsWith('"') && jsonResult.endsWith('"')) {
                jsonResult.substring(1, jsonResult.length - 1)
            } else jsonResult
        }
    }
}
