// Só guarda a "casca" do app pra abrir rápido; o áudio e a biblioteca vêm sempre do homelab (outra origem).
const CACHE = "music-shell-v3";
const SHELL = ["./", "index.html", "style.css", "app.js", "card.js", "manifest.webmanifest", "icons/icon-192.png"];

// `reload`/`no-cache` pulam o cache HTTP (o GitHub Pages guarda ~10 min): senão uma versão nova demora a chegar.
self.addEventListener("install", (e) => e.waitUntil(
  caches.open(CACHE).then((c) => c.addAll(SHELL.map((url) => new Request(url, { cache: "reload" })))),
));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
));
self.addEventListener("fetch", (e) => {
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: "no-cache" }).catch(() => caches.match(e.request)));
});
