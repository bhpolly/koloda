/* Колода: офлайн-режим. Сайт открывается без сети из кэша; когда сеть есть, всегда берётся свежая версия.
   Данные (слова) сюда не попадают: они лежат в браузере или в облаке аккаунта. */
const CACHE = "koloda-shell-v20";
const SHELL = [
  "./", "index.html", "app.css", "app.js", "course.js", "course/lib.js",
  "course/u1.js", "course/u2.js", "course/u3.js", "course/u4.js", "course/u5.js", "course/u6.js",
  "course/u7.js", "course/u8.js", "course/u9.js", "course/u10.js", "fx.js", "config.js",
  "manifest.webmanifest", "vendor/supabase-2.117.3.js", "icons/icon-192.png", "icons/favicon-32.png", "icons/favicon-48.png", "art/cat.svg",
  "art/cards.svg", "art/mascot.svg", "fonts/caveat-cyrillic-700-normal.woff2", "fonts/caveat-latin-700-normal.woff2", "fonts/inter-tight-cyrillic-500-normal.woff2", "fonts/inter-tight-cyrillic-600-italic.woff2",
  "fonts/inter-tight-cyrillic-600-normal.woff2", "fonts/inter-tight-cyrillic-700-normal.woff2", "fonts/inter-tight-cyrillic-800-italic.woff2", "fonts/inter-tight-cyrillic-800-normal.woff2", "fonts/inter-tight-cyrillic-900-normal.woff2", "fonts/inter-tight-latin-500-normal.woff2",
  "fonts/inter-tight-latin-600-italic.woff2", "fonts/inter-tight-latin-600-normal.woff2", "fonts/inter-tight-latin-700-normal.woff2", "fonts/inter-tight-latin-800-italic.woff2", "fonts/inter-tight-latin-800-normal.woff2", "fonts/inter-tight-latin-900-normal.woff2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const STATIC = /\.(woff2|png|gz)$|\/vendor\//;
async function networkFirst(req, ms) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), ms))]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") { const idx = await cache.match("index.html") || await cache.match("./"); if (idx) return idx; }
    return fetch(req);
  }
}
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;   // внешние сервисы и Supabase идут напрямую
  e.respondWith(STATIC.test(url.pathname) ? cacheFirst(req) : networkFirst(req, 4000));
});
