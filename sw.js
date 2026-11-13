// Flow Tile service worker: lets the game load offline after the first visit.
// Bump VERSION whenever cached files change so old caches are dropped.
const VERSION = "v86";
const CACHE = `flowtile-${VERSION}`;
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@500;700&display=swap";
const LOCAL = ["./", "./level/1/", "./level/2/", "./level/3/", "./level/4/", "./level/5/", "./level/6/", "./level/7/", "./level/8/", "./level/9/", "./level/10/", "./level/11/", "./level/12/", "./level/13/", "./level/14/", "./level/15/", "./level/16/", "./level/17/", "./level/18/", "./level/19/", "./level/20/", "./level/21/", "./level/22/", "./level/23/", "./level/24/", "./extra/fork/", "./extra/dam-builders/", "./extra/snowline/", "./extra/rain-pools/", "./extra/second-thoughts/", "./extra/dry-lightning/", "./extra/high-water/", "./extra/dunes/", "./big/40/", "./levels.js", "./solutions.js", "./river/", "./settings/", "./spring-hill/", "./perfection/", "./daily/", "./world/", "./custom/", "./generator/", "./tutorial/", "./big/", "./play.js", "./play.css", "./paper.css","./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(LOCAL);
    // Fonts are a nice-to-have: cache the CSS and the font files it points at, but never fail install over them.
    try {
      const res = await fetch(FONT_CSS);
      if (res.ok) {
        const css = await res.clone().text();
        await cache.put(FONT_CSS, res);
        const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]);
        await Promise.all(urls.map(u => fetch(u).then(r => r.ok && cache.put(u, r)).catch(() => {})));
      }
    } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("flowtile-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Pages (each map has its own): network first so new deploys show up, cache when offline.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (_) {
        return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Our own files (play.js, play.css, icons): network first, like pages, so a deploy never pairs a new page with
  // an old play.js. The cache is only the offline fallback.
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req, { cache: "no-cache" });
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (_) {
        return (await cache.match(req, { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  // Google Fonts: cache first, fill the cache on a miss.
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (fonts) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: url.origin === location.origin });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    })());
  }
});
