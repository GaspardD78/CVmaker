/**
 * APEC ID Mapper — content script.
 *
 * Le content script tourne dans un "isolated world" : il voit le DOM mais
 * pas les variables JS de la page, et inversement. Pour intercepter les
 * appels `fetch` / `XMLHttpRequest` que la page fait vers ses propres APIs,
 * on injecte `injected.js` directement dans le main world (où vit le code
 * de la page) via une balise `<script>`. Le bridge se fait ensuite par
 * `window.postMessage` (page → content script) puis `chrome.runtime`
 * (content script → background).
 */

(function injectInterceptor() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = () => script.remove();
  // Injection avant tout autre <script> de la page : `run_at: "document_start"`
  // garantit qu'on s'exécute avant que la page ait pu déclarer ses fetch.
  (document.head || document.documentElement).appendChild(script);
})();

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.__apec_id_mapper !== true) return;

  // Forward au background — `chrome.storage.local` n'est pas accessible depuis
  // le main world, donc tout passe par le service worker.
  chrome.runtime.sendMessage({
    type:    'APEC_REQUEST_CAPTURED',
    url:     data.url,
    method:  data.method,
    body:    data.body,
    response: data.response,
    capturedAt: Date.now(),
  }).catch(() => {
    // Ignoré : popup fermée / extension rechargée. Les captures futures fonctionneront.
  });
});
