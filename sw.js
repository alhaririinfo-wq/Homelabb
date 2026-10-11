/* HomeLab — يعمل بدون إنترنت */
const CACHE = 'homelab-e5f928da06';
const FILES = ["./", "icon-192.png", "icon-512.png", "index.html", "js/boot.js", "js/core.js", "js/docx-writer.js", "js/editors.js", "js/files.js", "js/home.js", "js/local-store.js", "js/pdf-editor.js", "js/phone.js", "js/prayer.js", "js/radio.js", "js/settings.js", "js/tools-islamic.js", "js/tools-media.js", "js/tools.js", "manifest.json", "style.css", "vendor/adhan.umd.min.js", "vendor/jsqr.js", "vendor/jszip.min.js", "vendor/mammoth.browser.min.js", "vendor/pdf-lib.min.js", "vendor/pdf.min.js", "vendor/pdf.worker.min.js", "vendor/qrcode.js", "vendor/xlsx.full.min.js"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // الراديو والطقس من الإنترنت مباشرة
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
    return res;
  }).catch(() => caches.match('./'))));
});
