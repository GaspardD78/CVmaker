package com.jules.resume_forge

import android.content.Context
import android.content.Intent
import android.webkit.CookieManager

/**
 * Bridge appelé depuis Rust (JNI) pour piloter le login session-cookies sur
 * Android. Toutes les méthodes sont @JvmStatic pour pouvoir être invoquées
 * via `call_static_method`.
 *
 * Pourquoi cette classe ?
 *   - Lance la `LoginActivity` (WebView plein écran) avec la bonne URL.
 *   - Lit / efface les cookies du `CookieManager` du process — les mêmes que
 *     ceux utilisés par la WebView principale Tauri, et donc par
 *     `scrapeWithIframe()` côté JS. C'est ce partage qui rend le scraping
 *     post-login fonctionnel.
 */
object LoginLauncher {

    @JvmStatic
    fun openLogin(context: Context, url: String) {
        val intent = Intent(context, LoginActivity::class.java).apply {
            putExtra(LoginActivity.EXTRA_URL, url)
            // Le context passé depuis Rust est l'application context : il faut
            // FLAG_ACTIVITY_NEW_TASK pour pouvoir lancer une Activity depuis là.
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    /** Renvoie la chaîne de cookies pour `domainUrl` (ex. "https://www.linkedin.com"), ou null. */
    @JvmStatic
    fun getCookies(domainUrl: String): String? {
        return CookieManager.getInstance().getCookie(domainUrl)
    }

    /**
     * Expire tous les cookies du domaine fourni. CookieManager n'a pas d'API
     * « remove by domain » directe : on récupère la liste, on réinjecte chaque
     * paire avec `Max-Age=0`, puis on flush.
     */
    @JvmStatic
    fun clearCookiesForDomain(domainUrl: String) {
        val cm = CookieManager.getInstance()
        val raw = cm.getCookie(domainUrl) ?: return
        raw.split(";").forEach { entry ->
            val name = entry.substringBefore('=').trim()
            if (name.isNotEmpty()) {
                cm.setCookie(domainUrl, "$name=; Max-Age=0; Path=/")
            }
        }
        cm.flush()
    }
}
