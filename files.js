/* files.js — مدير الملفات */
'use strict';
const Files = {
  path: '', items: [], sel: new Set(), last: null, trash: false, searchMode: false,
  sort: store.get('sort', { key: 'name', dir: 1 }),
  mode: store.get('viewMode', 'list'),

  async load(path = this.path, keepSel) {
    try {
      const d = await api.list(path, this.trash);
      this.path = d.path; this.items = d.items; this.searchMode = false;
      if (!keepSel) this.sel.clear();
      this.render();
    } catch (e) {
      toastErr(e);
      if (path) { this.path = ''; this.load(''); }
    }
  },

  sorted() {
    const { key, dir } = this.sort;
    return [...this.items].sort((a, b) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      let r = key === 'name' ? a.name.localeCompare(b.name, 'ar', { numeric: true, sensitivity: 'base' }) : (a[key] - b[key]);
      return r * dir;
    });
  },

  render() {
    const parts = this.path ? this.path.split('/') : [];
    $('#crumbs').innerHTML = `<button data-p="">${this.trash ? '🗑 سلة المحذوفات' : '🏠 ملفاتي'}</button>` +
      parts.map((p, i) => `<span class="sep">‹</span><button data-p="${esc(parts.slice(0, i + 1).join('/'))}">${esc(p)}</button>`).join('') +
      (this.searchMode ? `<span class="sep">‹</span><button>نتائج البحث</button>` : '');
    const list = $('#fileList');
    list.className = 'file-list ' + (this.mode === 'grid' ? 'grid-mode' : 'list');
    $('#fViewMode').textContent = this.mode === 'grid' ? '☰' : '▦';
    $('#fTrash').classList.toggle('active', this.trash);
    const arrow = k => this.sort.key === k ? (this.sort.dir > 0 ? ' ▲' : ' ▼') : '';
    const items = this.sorted();
    let html = `<div class="fl-head"><span></span><span data-sort="name">الاسم${arrow('name')}</span><span data-sort="size">الحجم${arrow('size')}</span><span data-sort="mtime">آخر تعديل${arrow('mtime')}</span><span></span></div>`;
    if (!items.length) {
      html += this.trash ? `<div class="empty"><b>🗑</b>السلة فارغة</div>`
        : this.searchMode ? `<div class="empty"><b>🔍</b>ما في نتائج</div>`
          : `<div class="empty"><b>📂</b>المجلد فارغ — اسحب ملفات هنا أو اضغط "رفع ملفات"</div>`;
    }
    for (const it of items) {
      if (this.trash && this.path === '.trash' && it.name === '.meta.json') continue;
      const thumb = this.mode === 'grid' && IMG_EXT.has(it.ext) && it.size < 15e6
        ? `<img loading="lazy" data-thumb="${esc(it.path)}" alt="">` : iconFor(it);
      html += `<div class="fitem${this.sel.has(it.path) ? ' sel' : ''}" data-path="${esc(it.path)}" draggable="${!this.trash}">
        <span class="ficon">${thumb}</span>
        <span class="fname" title="${esc(it.name)}">${it.name === '.versions' ? '🕘 النسخ السابقة (قبل كل حفظ)' : esc(it.name)}${this.searchMode ? `<small class="muted"> — /${esc(fmt.dir(it.path))}</small>` : ''}</span>
        <span class="fsize">${it.dir ? '—' : fmt.size(it.size)}</span>
        <span class="fdate">${fmt.date(it.mtime)}</span>
        <button class="icon-btn more" data-more title="خيارات">⋯</button></div>`;
    }
    list.innerHTML = html;
    $$('img[data-thumb]', list).forEach(async img => { try { img.src = await api.blobUrl(img.dataset.thumb); } catch { } });
    this.updateSelbar();
  },

  item(p) { return this.items.find(i => i.path === p); },
  selected() { return [...this.sel].map(p => this.item(p)).filter(Boolean); },

  updateSelbar() {
    $$('.fitem').forEach(el => el.classList.toggle('sel', this.sel.has(el.dataset.path)));
    const s = this.selected();
    $('#selbar').hidden = !s.length;
    $('#selCount').textContent = s.length + ' محدد';
    const pdfs = s.filter(i => i.ext === 'pdf');
    const imgs = s.filter(i => ['jpg', 'jpeg', 'png'].includes(i.ext));
    $('[data-act=mergepdf]').hidden = !(pdfs.length >= 2 && pdfs.length === s.length);
    $('[data-act=img2pdf]').hidden = !(imgs.length >= 1 && imgs.length === s.length);
    $$('#selbar [data-act=copy],#selbar [data-act=move]').forEach(b => b.hidden = this.trash);
    $('#selbar [data-act=download]').textContent = this.trash ? '↩ استرجاع' : 'تنزيل';
    $('#selbar [data-act=delete]').textContent = this.trash ? 'حذف نهائي' : 'حذف';
  },

  open(it) {
    if (!it) return;
    if (this.trash) return;
    if (it.dir) return this.load(it.path);
    const kind = editorKind(it.ext);
    if (kind) { recent.add(it); router.nav('#/editor/' + encodeURIComponent(it.path)); }
    else if (['doc', 'ppt', 'pptx', 'odt'].includes(it.ext)) {
      toast(`صيغة <b>.${esc(it.ext)}</b> القديمة غير مدعومة للتعديل — تم تنزيلها. (حوّلها لـ docx/xlsx للتعديل هنا)`, '', 6000);
      this.download([it]);
    } else this.download([it]);
  },

  download(items) {
    items.filter(i => !i.dir).forEach((i, n) => setTimeout(() => api.download(i.path).catch(toastErr), n * 300));
    if (items.some(i => i.dir)) toast('تنزيل المجلدات غير مدعوم — نزّل الملفات من داخلها');
  },

  async rename(it) {
    const name = await modal.prompt('إعادة تسمية', it.name);
    if (!name || name === it.name) return;
    try { await api.post('/api/rename', { path: it.path, name }); toast('تمت إعادة التسمية', 'ok'); this.load(); } catch (e) { toastErr(e); }
  },

  async del(items) {
    if (!items.length) return;
    const perm = this.trash;
    const ok = await modal.confirm(perm ? 'حذف نهائي؟' : 'نقل إلى السلة؟',
      `${items.length === 1 ? '<b>' + esc(items[0].name) + '</b>' : items.length + ' عناصر'}${perm ? ' — لا يمكن التراجع' : ' — يمكنك استرجاعها من السلة 🗑'}`, perm ? 'حذف نهائي' : 'حذف', true);
    if (!ok) return;
    try { await api.post('/api/delete', { paths: items.map(i => i.path), permanent: perm }); toast('تم الحذف', 'ok'); this.load(); } catch (e) { toastErr(e); }
  },

  async moveCopy(items, copy) {
    const dest = await modal.pickFolder(copy ? 'نسخ إلى…' : 'نقل إلى…');
    if (dest == null) return;
    try { await api.post(copy ? '/api/copy' : '/api/move', { paths: items.map(i => i.path), dest }); toast(copy ? 'تم النسخ' : 'تم النقل', 'ok'); this.load(); } catch (e) { toastErr(e); }
  },

  async uploadFiles(entries, folder = this.path) {
    if (!entries.length) return;
    const total = entries.reduce((s, e) => s + e.file.size, 0);
    const t = toast(`<div>جاري رفع ${entries.length} ملف…</div><div class="progress"><div></div></div>`, '', 0);
    const bar = $('.progress div', t);
    let done = 0, failed = 0;
    for (const { file, rel } of entries) {
      try {
        await api.upload(folder, file, rel, p => { bar.style.width = ((done + p * file.size) / total * 100 || 100) + '%'; });
      } catch (e) { failed++; toastErr(file.name + ': ' + e.message); }
      done += file.size;
    }
    t.remove();
    toast(`تم رفع ${entries.length - failed} ملف`, 'ok');
    if (folder === this.path) this.load(this.path, true);
  },

  async newFile(kind) {
    const names = { txt: 'ملف جديد.txt', md: 'ملاحظات.md', docx: 'مستند جديد.docx', xlsx: 'جدول جديد.xlsx', pdf: 'مستند جديد.pdf' };
    let name = await modal.prompt('اسم الملف الجديد', names[kind]);
    if (!name) return;
    if (!name.toLowerCase().endsWith('.' + kind)) name += '.' + kind;
    try {
      let blob;
      if (kind === 'docx') blob = await DocxWriter.fromHTML('<p></p>');
      else if (kind === 'xlsx') {
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['']]), 'Sheet1');
        blob = new Blob([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })]);
      } else if (kind === 'pdf') {
        const d = await PDFLib.PDFDocument.create(); d.addPage(PDFLib.PageSizes.A4); blob = new Blob([await d.save()]);
      } else blob = new Blob(['']);
      const r = await api.upload(this.path, new File([blob], name));
      await this.load(this.path);
      this.open(r.item);
    } catch (e) { toastErr(e); }
  },

  async mergePdfs(items) {
    const name = await modal.prompt('اسم ملف PDF المدموج', 'مدموج.pdf');
    if (!name) return;
    const t = toast('جاري الدمج…', '', 0);
    try {
      const out = await PDFLib.PDFDocument.create();
      for (const it of items) {
        const src = await PDFLib.PDFDocument.load(await api.fetchBuffer(it.path), { ignoreEncryption: true });
        (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
      }
      await api.upload(this.path, new File([await out.save()], name.endsWith('.pdf') ? name : name + '.pdf'));
      toast('تم الدمج ✔', 'ok'); this.load();
    } catch (e) { toastErr(e); } finally { t.remove(); }
  },

  async imagesToPdf(items) {
    const name = await modal.prompt('اسم ملف PDF', 'صور.pdf');
    if (!name) return;
    const t = toast('جاري التحويل…', '', 0);
    try {
      const out = await PDFLib.PDFDocument.create();
      for (const it of items) {
        const buf = await api.fetchBuffer(it.path);
        const img = it.ext === 'png' ? await out.embedPng(buf) : await out.embedJpg(buf);
        // صفحة A4 مع احتواء الصورة
        const [W, H] = img.width > img.height ? [841.89, 595.28] : [595.28, 841.89];
        const s = Math.min((W - 40) / img.width, (H - 40) / img.height, 1.5);
        const page = out.addPage([W, H]);
        page.drawImage(img, { x: (W - img.width * s) / 2, y: (H - img.height * s) / 2, width: img.width * s, height: img.height * s });
      }
      await api.upload(this.path, new File([await out.save()], name.endsWith('.pdf') ? name : name + '.pdf'));
      toast('تم إنشاء PDF ✔', 'ok'); this.load();
    } catch (e) { toastErr(e); } finally { t.remove(); }
  },

  ctxMenu(x, y, it) {
    const m = $('#ctx');
    const s = this.selected();
    const multi = s.length > 1;
    let h = '';
    if (this.trash) {
      h = `<button data-c="restore">↩ استرجاع</button><hr><button class="danger" data-c="delete">✖ حذف نهائي</button>`;
    } else if (it) {
      if (!multi) h += `<button data-c="open">${it.dir ? '📂 فتح' : '✏ فتح / تعديل'}</button>`;
      if (!multi && !it.dir) h += `<button data-c="download">⬇ تنزيل للجهاز</button>`;
      if (!multi && !it.dir && navigator.share) h += `<button data-c="share">📤 مشاركة</button>`;
      if (!multi) h += `<button data-c="rename">✎ إعادة تسمية</button>`;
      h += `<button data-c="copy">⧉ نسخ إلى…</button><button data-c="move">➜ نقل إلى…</button>`;
      if (!multi && !it.dir) h += `<button data-c="dup">⎘ تكرار هنا</button>`;
      h += `<hr><button class="danger" data-c="delete">🗑 حذف</button>`;
    } else {
      h = `<button data-c="upload">⬆ رفع ملفات</button><button data-c="mkdir">+ مجلد جديد</button><button data-c="newtxt">+ ملف نصي</button><button data-c="refresh">⟳ تحديث</button>`;
    }
    m.innerHTML = h; m.hidden = false;
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
    m.onclick = async e => {
      const c = e.target.closest('[data-c]')?.dataset.c; if (!c) return;
      m.hidden = true;
      const items = s.length ? s : (it ? [it] : []);
      ({
        open: () => this.open(it), download: () => this.download([it]), share: () => api.share(it.path).catch(er => er.name !== 'AbortError' && toastErr(er)), rename: () => this.rename(it),
        copy: () => this.moveCopy(items, true), move: () => this.moveCopy(items, false), delete: () => this.del(items),
        restore: () => this.restore(items),
        dup: async () => { try { await api.post('/api/copy', { paths: [it.path], dest: this.path }); this.load(); } catch (er) { toastErr(er); } },
        upload: () => $('#fileInput').click(), mkdir: () => $('#fNewDir').click(), newtxt: () => this.newFile('txt'), refresh: () => this.load(),
      })[c]?.();
    };
  },

  async restore(items) {
    try { await api.post('/api/restore', { names: items.map(i => i.name) }); toast('تم الاسترجاع', 'ok'); this.load(); } catch (e) { toastErr(e); }
  },

  async search(q) {
    if (!q.trim()) return this.load(this.path);
    try {
      const d = await api.get('/api/search?q=' + encodeURIComponent(q));
      this.items = d.items; this.searchMode = true; this.sel.clear(); this.render();
    } catch (e) { toastErr(e); }
  },

  init() {
    const list = $('#fileList');
    $('#crumbs').onclick = e => { const b = e.target.closest('[data-p]'); if (b) this.load(b.dataset.p); };
    list.addEventListener('click', e => {
      const hs = e.target.closest('[data-sort]');
      if (hs) { const k = hs.dataset.sort; this.sort = { key: k, dir: this.sort.key === k ? -this.sort.dir : 1 }; store.set('sort', this.sort); return this.render(); }
      const el = e.target.closest('.fitem');
      if (e.target.closest('[data-more]')) { e.stopPropagation(); const it = this.item(el.dataset.path); if (!this.sel.has(it.path)) { this.sel = new Set([it.path]); this.updateSelbar(); } const r = e.target.getBoundingClientRect(); return this.ctxMenu(r.left, r.bottom, it); }
      if (!el) { this.sel.clear(); return this.updateSelbar(); }
      const p = el.dataset.path;
      if (this.touch && !this.sel.size) { this.touch = false; return this.open(this.item(p)); }
      this.touch = false;
      if (e.ctrlKey || e.metaKey) { this.sel.has(p) ? this.sel.delete(p) : this.sel.add(p); }
      else if (e.shiftKey && this.last) {
        const order = this.sorted().map(i => i.path); const a = order.indexOf(this.last), b = order.indexOf(p);
        order.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => this.sel.add(x));
      } else this.sel = new Set([p]);
      this.last = p; this.updateSelbar();
    });
    list.addEventListener('pointerdown', e => { this.touch = e.pointerType === 'touch'; });
    list.addEventListener('dblclick', e => { const el = e.target.closest('.fitem'); el && this.open(this.item(el.dataset.path)); });
    list.addEventListener('contextmenu', e => {
      e.preventDefault();
      const el = e.target.closest('.fitem'); let it = null;
      if (el) { it = this.item(el.dataset.path); if (!this.sel.has(it.path)) { this.sel = new Set([it.path]); this.updateSelbar(); } }
      this.ctxMenu(e.clientX, e.clientY, it);
    });

    /* سحب عناصر لمجلد = نقل */
    list.addEventListener('dragstart', e => {
      const el = e.target.closest('.fitem'); if (!el) return;
      if (!this.sel.has(el.dataset.path)) { this.sel = new Set([el.dataset.path]); this.updateSelbar(); }
      e.dataTransfer.setData('application/x-homelab', JSON.stringify([...this.sel]));
      e.dataTransfer.effectAllowed = 'move';
    });
    list.addEventListener('dragover', e => {
      const el = e.target.closest('.fitem');
      $$('.fitem.dragover').forEach(x => x.classList.remove('dragover'));
      if (el && this.item(el.dataset.path)?.dir && e.dataTransfer.types.includes('application/x-homelab')) { e.preventDefault(); el.classList.add('dragover'); }
    });
    list.addEventListener('drop', async e => {
      const raw = e.dataTransfer.getData('application/x-homelab'); if (!raw) return;
      e.preventDefault(); e.stopPropagation();
      $$('.fitem.dragover').forEach(x => x.classList.remove('dragover'));
      const el = e.target.closest('.fitem'); const dest = el && this.item(el.dataset.path);
      const paths = JSON.parse(raw).filter(p => p !== dest?.path);
      if (!dest?.dir || !paths.length) return;
      try { await api.post('/api/move', { paths, dest: dest.path }); toast('تم النقل إلى ' + esc(dest.name), 'ok'); this.load(); } catch (er) { toastErr(er); }
    });

    /* رفع بالسحب من سطح المكتب (يدعم المجلدات) */
    const dz = $('#dropzone'); let dc = 0;
    dz.addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')) { dc++; dz.classList.add('drag'); } });
    dz.addEventListener('dragleave', () => { if (--dc <= 0) { dc = 0; dz.classList.remove('drag'); } });
    dz.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
    dz.addEventListener('drop', async e => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault(); dc = 0; dz.classList.remove('drag');
      if (this.trash) return toast('لا يمكن الرفع إلى السلة');
      const entries = [];
      const walk = async (entry, prefix) => {
        if (entry.isFile) { const f = await new Promise((r, j) => entry.file(r, j)); entries.push({ file: f, rel: prefix ? prefix + '/' + f.name : '' }); }
        else if (entry.isDirectory) {
          const reader = entry.createReader(); let batch;
          do { batch = await new Promise((r, j) => reader.readEntries(r, j)); for (const c of batch) await walk(c, (prefix ? prefix + '/' : '') + entry.name); } while (batch.length);
        }
      };
      const its = [...e.dataTransfer.items].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry());
      if (its.every(Boolean)) { for (const en of its) await walk(en, ''); }
      else [...e.dataTransfer.files].forEach(f => entries.push({ file: f, rel: '' }));
      this.uploadFiles(entries);
    });

    $('#fUpload').onclick = () => $('#fileInput').click();
    $('#fUploadDir').onclick = () => $('#dirInput').click();
    $('#fileInput').onchange = e => { this.uploadFiles([...e.target.files].map(f => ({ file: f, rel: '' }))); e.target.value = ''; };
    $('#dirInput').onchange = e => { this.uploadFiles([...e.target.files].map(f => ({ file: f, rel: f.webkitRelativePath }))); e.target.value = ''; };
    $('#fNewDir').onclick = async () => {
      const name = await modal.prompt('اسم المجلد الجديد', 'مجلد جديد'); if (!name) return;
      try { await api.post('/api/mkdir', { path: this.path, name }); this.load(); } catch (e) { toastErr(e); }
    };
    $$('[data-new]').forEach(b => b.onclick = () => { b.closest('.dropdown').classList.remove('open'); this.newFile(b.dataset.new); });
    $('#fViewMode').onclick = () => { this.mode = this.mode === 'grid' ? 'list' : 'grid'; store.set('viewMode', this.mode); this.render(); };
    $('#fTrash').onclick = () => { this.trash = !this.trash; this.load(this.trash ? '.trash' : ''); };
    let st; $('#fSearch').oninput = e => { clearTimeout(st); st = setTimeout(() => this.search(e.target.value), 300); };
    $('#selbar').onclick = e => {
      const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
      const s = this.selected();
      ({
        download: () => this.trash ? this.restore(s) : this.download(s), copy: () => this.moveCopy(s, true), move: () => this.moveCopy(s, false),
        delete: () => this.del(s), clear: () => { this.sel.clear(); this.updateSelbar(); },
        mergepdf: () => this.mergePdfs(s), img2pdf: () => this.imagesToPdf(s),
      })[a]?.();
    };

    /* اختصارات لوحة المفاتيح */
    document.addEventListener('keydown', e => {
      if (router.current !== 'files' || !$('#modal').hidden || e.target.matches('input,textarea,[contenteditable]')) return;
      const s = this.selected();
      if (e.key === 'Delete' && s.length) this.del(s);
      else if (e.key === 'F2' && s.length === 1) { e.preventDefault(); this.rename(s[0]); }
      else if (e.key === 'Enter' && s.length === 1) this.open(s[0]);
      else if (e.key === 'Backspace' && this.path) { e.preventDefault(); this.load(fmt.dir(this.path)); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); this.items.forEach(i => this.sel.add(i.path)); this.updateSelbar(); }
      else if (e.key === 'Escape') { this.sel.clear(); this.updateSelbar(); }
    });
  },
};

/* الملفات الأخيرة */
const recent = {
  add(it) { const r = store.get('recent', []).filter(x => x.path !== it.path); r.unshift({ path: it.path, name: it.name, ext: it.ext, t: Date.now() }); store.set('recent', r.slice(0, 12)); },
  all: () => store.get('recent', []),
};

Files.init();
router.on('files', () => { if (!Files.items.length && !Files.searchMode) Files.load(Files.path); else Files.load(Files.path, true); });
