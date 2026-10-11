/* HomeLab — يعمل بدون إنترنت */
const CACHE = 'homelab-46d89df110';
const FILES = ["./", "adhan.umd.min.js", "boot.js", "core.js", "docx-writer.js", "editors.js", "files.js", "home.js", "icon-192.png", "icon-512.png", "index.html", "jsqr.js", "jszip.min.js", "local-store.js", "mammoth.browser.min.js", "manifest.json", "pdf-editor.js", "pdf-lib.min.js", "pdf.min.js", "pdf.worker.min.js", "phone.js", "prayer.js", "qrcode.js", "radio.js", "settings.js", "style.css", "tools-islamic.js", "tools-media.js", "tools.js", "xlsx.full.min.js"];
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
