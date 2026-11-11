// Service worker: guarda la app en el aparato para que abra sin conexión.
// Al publicar cambios, sube el número de versión para forzar la actualización.
const VERSION = 'gd-v0.4.0';
const SHELL = [
  './', './index.html', './app.js', './store.js', './db.js', './google.js', './config.js', './ui.js', './device.js', './types.js',
  './media.js', './checks.js', './tiff.js', './files.js', './work.js', './capture.js', './samples.js', './street.js', './numbers.js', './settings.js', './packs.js', './importer.js', './exporter.js', './zip.js', './backup.js', './merge3.js', './version.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
];
const LIB_HOST = 'cdn.jsdelivr.net';

self.addEventListener('install', (e) => {
  // cache: 'reload' evita coger copias viejas de la caché del navegador (GitHub guarda 10 min).
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'lib').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Archivos de la app: responde con la copia guardada y actualiza en segundo plano.
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const key = req.mode === 'navigate' ? './index.html' : req;
      const cached = await cache.match(key, { ignoreSearch: true });
      const fresh = fetch(url.origin + url.pathname, { cache: 'no-cache' }).then((r) => {
        if (r.ok && r.type === 'basic') cache.put(key, r.clone());
        return r;
      }).catch(() => cached);
      return cached || fresh;
    })());
    return;
  }

  // Conversor de fotos HEIC: se descarga una vez y se guarda.
  if (url.hostname === LIB_HOST) {
    e.respondWith((async () => {
      const cache = await caches.open('lib');
      const cached = await cache.match(req);
      if (cached) return cached;
      const r = await fetch(req);
      if (r.ok || r.type === 'opaque') cache.put(req, r.clone());
      return r;
    })());
  }
  // Google (Drive, inicio de sesión): siempre a la red.
});
