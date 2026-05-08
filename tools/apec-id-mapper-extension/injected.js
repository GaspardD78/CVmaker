/**
 * APEC ID Mapper — injected script.
 *
 * Tourne dans le main world de la page (chargé via une balise <script> par
 * `content.js`). Wrappe `window.fetch` et `XMLHttpRequest` pour capturer les
 * appels POST vers `/cms/webservices/rechercheOffre` et ses variantes
 * (`.../rechercheOffre/ids`, etc.) qui transportent les filtres APEC dans
 * leur body JSON.
 *
 * Capture pertinente :
 *   - request.body : `{ "lieux": [711], "fonctions": [101832], ... }`
 *   - response     : éventuellement utile pour afficher le `totalCount`
 *
 * Tout est envoyé au content script via `window.postMessage` ; impossible
 * d'utiliser `chrome.runtime` ici, on est dans la sandbox de la page.
 */

(function () {
  // Garde anti double-injection (ex. SPA qui recharge le script).
  if (window.__APEC_ID_MAPPER_INJECTED__) return;
  window.__APEC_ID_MAPPER_INJECTED__ = true;

  const APEC_API_RE = /\/cms\/webservices\/rechercheOffre(?:\/[\w-]+)?(?:\?|$)/i;

  const post = (payload) => {
    try {
      window.postMessage({ __apec_id_mapper: true, ...payload }, '*');
    } catch (_) {
      // Body non sérialisable (rare) : on l'ignore plutôt que de planter la page.
    }
  };

  // ── fetch ──────────────────────────────────────────────────────────────────
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = async function (input, init) {
      const url = typeof input === 'string'
        ? input
        : (input && input.url) || '';
      const method = (init && init.method) || (input && input.method) || 'GET';
      const isApec = APEC_API_RE.test(url);

      let bodyText = null;
      if (isApec && init && init.body) {
        try {
          bodyText = typeof init.body === 'string' ? init.body : await new Response(init.body).text();
        } catch (_) {
          bodyText = null;
        }
      }

      const res = await origFetch.apply(this, arguments);

      if (isApec) {
        // Cloner pour ne pas consommer le stream original (la page en a besoin).
        let responseText = null;
        try {
          responseText = await res.clone().text();
        } catch (_) { /* ignore */ }
        post({ url, method, body: bodyText, response: responseText });
      }
      return res;
    };
  }

  // ── XMLHttpRequest ─────────────────────────────────────────────────────────
  const OrigXHR = window.XMLHttpRequest;
  if (typeof OrigXHR === 'function') {
    const origOpen = OrigXHR.prototype.open;
    const origSend = OrigXHR.prototype.send;

    OrigXHR.prototype.open = function (method, url) {
      this.__apec_url = url;
      this.__apec_method = method;
      this.__apec_isApec = APEC_API_RE.test(url);
      return origOpen.apply(this, arguments);
    };

    OrigXHR.prototype.send = function (body) {
      if (this.__apec_isApec) {
        this.addEventListener('load', () => {
          let responseText = null;
          try { responseText = this.responseText; } catch (_) { /* ignore */ }
          post({
            url: this.__apec_url,
            method: this.__apec_method,
            body: typeof body === 'string' ? body : null,
            response: responseText,
          });
        });
      }
      return origSend.apply(this, arguments);
    };
  }
})();
