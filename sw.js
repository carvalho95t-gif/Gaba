const CACHE = "gaba-omr-v12";
const PRECACHE = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./dashboard.html",
  "./manifest.json",
  "./js/omrLayout.js",
  "./js/qrPayload.js",
  "./js/versoes.js",
  "./js/docxParser.js",
  "./js/docParser.js",
  "./js/pdfParser.js",
  "./js/planilha.js",
  "./js/listaAlunos.js",
  "./js/folha.js",
  "./js/analise.js",
  "./js/uiCaderno.js",
  "./js/uiScanner.js",
  "./js/omrWorker.js",
  "./js/supabaseClient.js",
  "./js/credencial.js",
  "./js/offlineSync.js",
  "./js/escolas.js",
  "./js/descritoresMatriz.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

const CDN_ALLOW = [
  "cdn.jsdelivr.net",
  "unpkg.com",
  "docs.opencv.org"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isCdn = CDN_ALLOW.includes(url.hostname);
  const isSameOrigin = url.origin === self.location.origin;

  if (!isSameOrigin && !isCdn) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (isCdn) {
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            const copy = response.clone();
            const cache = await caches.open(CACHE);
            cache.put(request, copy);
          }
          return response;
        } catch (err) {
          if (cached) return cached;
          throw err;
        }
      }

      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        if (cached) return cached;
        if (request.mode === "navigate") {
          const fallback = await caches.match("./index.html");
          if (fallback) return fallback;
        }
        throw err;
      }
    })()
  );
});
