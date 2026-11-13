// Flow Tile service worker: lets the game load offline after the first visit.
// Bump VERSION whenever cached files change so old caches are dropped.
const VERSION = "v87";
const CACHE = `flowtile-${VERSION}`;
const LOCAL = ["./", "./level/1/", "./level/2/", "./level/3/", "./level/4/", "./level/5/", "./level/6/", "./level/7/", "./level/8/", "./level/9/", "./level/10/", "./level/11/", "./level/12/", "./level/13/", "./level/14/", "./level/15/", "./level/16/", "./level/17/", "./level/18/", "./level/19/", "./level/20/", "./level/21/", "./level/22/", "./level/23/", "./level/24/", "./extra/fork/", "./extra/dam-builders/", "./extra/snowline/", "./extra/rain-pools/", "./extra/second-thoughts/", "./extra/dry-lightning/", "./extra/high-water/", "./extra/dunes/", "./big/40/", "./levels.js", "./solutions.js", "./settings.js", "./river/", "./settings/", "./spring-hill/", "./perfection/", "./daily/", "./world/", "./custom/", "./generator/", "./tutorial/", "./big/", "./play.js", "./play.css", "./paper.css", "./fonts/fonts.css", "./fonts/mplus-rounded-500.woff2", "./fonts/mplus-rounded-700.woff2", "./fonts/mplus-rounded-800.woff2","./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(LOCAL);
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
});
