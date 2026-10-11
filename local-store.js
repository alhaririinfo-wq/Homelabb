/* local-store.js — نسخة الجوال: كل الملفات تنحفظ داخل الجهاز (IndexedDB) بدون أي سيرفر.
   يعمل فقط إذا window.HL_LOCAL = true، ويستبدل نفس واجهة api المستخدمة بنسخة الكمبيوتر. */
'use strict';
(() => {
  if (!window.HL_LOCAL) return;
  const TRASH = '.trash', VERS = '.trash/.versions';
  let dbp;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('homelab-files', 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore('files', { keyPath: 'path' }); s.createIndex('parent', 'parent'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(new Error('التخزين غير متاح بهذا المتصفح (وضع التصفح الخفي؟)'));
  }));
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('files', mode); const s = t.objectStore('files'); let out;
      Promise.resolve(fn(s)).then(v => out = v);
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error || new Error('خطأ بالتخزين')); t.onabort = () => rej(t.error || new Error('امتلأت مساحة التخزين؟'));
    });
  };
  const wrap = rq => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  const get = p => tx('readonly', s => wrap(s.get(p)));
  const all = () => tx('readonly', s => wrap(s.getAll()));
  const children = parent => tx('readonly', s => wrap(s.index('parent').getAll(parent)));
  const put = rec => tx('readwrite', s => { s.put(rec); });
  const parentOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
  const info = r => ({ name: fmt.base(r.path), path: r.path, dir: r.dir, size: r.size || 0, mtime: r.mtime, ext: r.dir ? '' : fmt.ext(fmt.base(r.path)) });
  const err = (m) => { throw new Error(m); };
  const checkName = n => { n = (n || '').trim(); if (!n || n === '.' || n === '..' || /[\/\\<>:"|?*\0]/.test(n)) err('اسم غير صالح'); return n; };
  const now = () => Date.now() / 1000;

  async function ensureDir(p) {
    if (!p) return;
    const parts = p.split('/'); let cur = '';
    for (const part of parts) {
      cur = cur ? cur + '/' + part : part;
      const r = await get(cur);
      if (!r) await put({ path: cur, parent: parentOf(cur), dir: true, mtime: now() });
      else if (!r.dir) err('يوجد ملف بنفس اسم المجلد: ' + part);
    }
  }
  async function unique(folder, name) {
    const join = n => folder ? folder + '/' + n : n;
    if (!(await get(join(name)))) return join(name);
    const dot = name.lastIndexOf('.'), stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
    for (let i = 1; ; i++) { const c = join(`${stem} (${i})${ext}`); if (!(await get(c))) return c; }
  }
  async function subtree(p) { const a = await all(); return a.filter(r => r.path === p || r.path.startsWith(p + '/')); }

  async function relocate(src, dest, copy) {
    const recs = await subtree(src);
    await tx('readwrite', s => {
      for (const r of recs) {
        const np = dest + r.path.slice(src.length);
        s.put({ ...r, path: np, parent: parentOf(np), mtime: copy ? now() : r.mtime });
        if (!copy) s.delete(r.path);
      }
    });
  }
  async function writeFile(path, blob) {
    await put({ path, parent: parentOf(path), dir: false, blob, size: blob.size, type: blob.type, mtime: now() });
    return info(await get(path));
  }

  const routes = {
    async 'GET /api/list'(q) {
      const path = q.get('path') || '';
      if (path) { const r = await get(path); if (!r || !r.dir) err('المجلد غير موجود'); }
      let items = (await children(path)).map(info);
      if (!path && q.get('trash') !== '1') items = items.filter(i => i.name !== TRASH);
      return { path, items };
    },
    async 'GET /api/search'(q) {
      const t = (q.get('q') || '').toLowerCase();
      return { items: (await all()).filter(r => !r.path.startsWith(TRASH) && fmt.base(r.path).toLowerCase().includes(t)).slice(0, 300).map(info) };
    },
    async 'GET /api/info'() {
      const a = (await all()).filter(r => !r.path.startsWith(TRASH));
      const files = a.filter(r => !r.dir);
      let est = {}; try { est = await navigator.storage.estimate(); } catch { }
      return { root: 'ذاكرة الجوال', disk_total: est.quota || 0, disk_used: est.usage || 0, disk_free: (est.quota || 0) - (est.usage || 0), files: files.length, files_size: files.reduce((s, r) => s + (r.size || 0), 0) };
    },
    async 'GET /api/lan'() { return { lan: false, local: true, mobile: true, urls: [] }; },
    async 'POST /api/mkdir'(q, d) {
      const p = fmt.join(d.path || '', checkName(d.name));
      if (await get(p)) err('يوجد عنصر بنفس الاسم');
      await ensureDir(d.path || ''); await put({ path: p, parent: d.path || '', dir: true, mtime: now() });
      return { ok: true, item: info(await get(p)) };
    },
    async 'POST /api/rename'(q, d) {
      const p = d.path, np = fmt.join(parentOf(p), checkName(d.name));
      if (await get(np)) err('يوجد عنصر بنفس الاسم');
      await relocate(p, np, false);
      return { ok: true, item: info(await get(np)) };
    },
    async 'POST /api/move'(q, d) { return moveCopy(d, false); },
    async 'POST /api/copy'(q, d) { return moveCopy(d, true); },
    async 'POST /api/delete'(q, d) {
      const meta = JSON.parse(localStorage.getItem('hl.trashMeta') || '{}');
      await ensureDir(TRASH);
      for (const p of d.paths || []) {
        if (!p || p === TRASH) continue;
        if (d.permanent || p.startsWith(TRASH + '/')) {
          const recs = await subtree(p); await tx('readwrite', s => recs.forEach(r => s.delete(r.path)));
          delete meta[fmt.base(p)]; continue;
        }
        const dest = await unique(TRASH, fmt.base(p));
        await relocate(p, dest, false);
        meta[fmt.base(dest)] = { from: p, at: Date.now() };
      }
      localStorage.setItem('hl.trashMeta', JSON.stringify(meta));
      return { ok: true };
    },
    async 'POST /api/restore'(q, d) {
      const meta = JSON.parse(localStorage.getItem('hl.trashMeta') || '{}');
      for (const name of d.names || []) {
        const src = TRASH + '/' + name; if (!(await get(src))) continue;
        const orig = (meta[name] && meta[name].from) || name;
        await ensureDir(parentOf(orig));
        await relocate(src, await unique(parentOf(orig), fmt.base(orig)), false);
        delete meta[name];
      }
      localStorage.setItem('hl.trashMeta', JSON.stringify(meta));
      return { ok: true };
    },
  };
  async function moveCopy(d, copy) {
    const dest = d.dest || '';
    if (dest) { const r = await get(dest); if (!r || !r.dir) err('المجلد الهدف غير موجود'); }
    const done = [];
    for (const p of d.paths || []) {
      if (dest === p || dest.startsWith(p + '/')) err('لا يمكن نقل مجلد داخل نفسه');
      if (!copy && parentOf(p) === dest) continue;
      const target = await unique(dest, fmt.base(p));
      await relocate(p, target, copy); done.push(target);
    }
    return { ok: true, done };
  }

  Object.assign(api, {
    async req(method, url, body) {
      const u = new URL(url, location.href);
      const fn = routes[method + ' ' + u.pathname];
      if (!fn) throw new Error('هذه الميزة متوفرة بنسخة الكمبيوتر فقط');
      return fn(u.searchParams, body || {});
    },
    fileUrl: () => '#',
    async blob(p) { const r = await get(p); if (!r || r.dir) throw new Error('الملف غير موجود'); return r.blob; },
    async fetchBuffer(p) { return (await api.blob(p)).arrayBuffer(); },
    async fetchText(p) { return (await api.blob(p)).text(); },
    _urls: new Map(),
    async blobUrl(p) {
      const old = api._urls.get(p); if (old) URL.revokeObjectURL(old);
      const u = URL.createObjectURL(await api.blob(p)); api._urls.set(p, u); return u;
    },
    async download(p) {
      const u = URL.createObjectURL(await api.blob(p));
      const a = document.createElement('a'); a.href = u; a.download = fmt.base(p); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 30000);
    },
    async save(p, blob) {
      const old = await get(p);
      if (old && !old.dir && old.blob) { // نسخة احتياطية قبل الكتابة
        await ensureDir(VERS);
        const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/(\d{8})(\d{6})/, '$1-$2');
        await put({ path: VERS + '/' + stamp + '__' + fmt.base(p), parent: VERS, dir: false, blob: old.blob, size: old.size, mtime: now() });
        const v = (await children(VERS)).sort((a, b) => a.mtime - b.mtime);
        if (v.length > 30) await tx('readwrite', s => v.slice(0, v.length - 30).forEach(r => s.delete(r.path)));
      }
      return { ok: true, item: await writeFile(p, blob instanceof Blob ? blob : new Blob([blob])) };
    },
    async upload(folder, file, relpath, onProgress, overwrite) {
      let dir = folder || '';
      if (relpath && relpath.includes('/')) dir = fmt.join(dir, relpath.split('/').slice(0, -1).join('/'));
      await ensureDir(dir);
      const name = checkName(file.name);
      const path = overwrite ? fmt.join(dir, name) : await unique(dir, name);
      const item = await writeFile(path, file);
      onProgress && onProgress(1);
      return { ok: true, item };
    },
  });

  // نطلب من المتصفح عدم مسح الملفات تلقائياً
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch { }
})();
