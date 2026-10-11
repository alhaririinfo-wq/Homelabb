/* core.js — أدوات مشتركة: API، تنقل، تنبيهات، نوافذ */
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(k, d) { try { const v = localStorage.getItem('hl.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hl.' + k, JSON.stringify(v)); } catch { } },
};

const api = {
  async req(method, url, body, isRaw) {
    const opt = { method, headers: { 'X-HomeLab': '1' } };
    if (body !== undefined) {
      if (isRaw) opt.body = body;
      else { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
    }
    let r;
    try { r = await fetch(url, opt); }
    catch { throw new Error('السيرفر متوقف؟ تأكد أن server.py شغال'); }
    if (r.status === 401) { location.reload(); throw new Error('انتهت الجلسة'); }
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : await r.text();
    if (!r.ok) throw new Error((data && data.error) || ('خطأ ' + r.status));
    return data;
  },
  get: (url) => api.req('GET', url),
  post: (url, body) => api.req('POST', url, body),
  list: (p, trash) => api.get('/api/list?path=' + encodeURIComponent(p) + (trash ? '&trash=1' : '')),
  fileUrl: (p, dl) => '/api/file?path=' + encodeURIComponent(p) + (dl ? '&download=1' : '') + '&t=' + Date.now(),
  async fetchBuffer(p) {
    const r = await fetch(api.fileUrl(p));
    if (!r.ok) throw new Error('تعذر فتح الملف');
    return r.arrayBuffer();
  },
  async fetchText(p) {
    const r = await fetch(api.fileUrl(p));
    if (!r.ok) throw new Error('تعذر فتح الملف');
    return r.text();
  },
  async blob(p) {
    const r = await fetch(api.fileUrl(p));
    if (!r.ok) throw new Error('تعذر فتح الملف');
    return r.blob();
  },
  /* رابط قابل للعرض (صورة/صوت/فيديو) */
  async blobUrl(p) { return api.fileUrl(p); },
  /* تنزيل ملف للجهاز */
  async download(p) {
    const a = document.createElement('a'); a.href = api.fileUrl(p, true); a.download = fmt.base(p);
    document.body.appendChild(a); a.click(); a.remove();
  },
  /* مشاركة ملف (جوال) */
  async share(p) {
    const b = await api.blob(p);
    const f = new File([b], fmt.base(p), { type: b.type || 'application/octet-stream' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) return navigator.share({ files: [f], title: f.name });
    return api.download(p);
  },
  save: (p, data) => api.req('POST', '/api/save?path=' + encodeURIComponent(p), data, true),
  upload(folder, file, relpath, onProgress, overwrite) {
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      let url = '/api/upload?path=' + encodeURIComponent(folder) + '&name=' + encodeURIComponent(file.name);
      if (relpath) url += '&relpath=' + encodeURIComponent(relpath);
      if (overwrite) url += '&overwrite=1';
      x.open('POST', url);
      x.setRequestHeader('X-HomeLab', '1');
      x.upload.onprogress = e => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
      x.onload = () => {
        let d = {}; try { d = JSON.parse(x.responseText); } catch { }
        x.status < 300 ? res(d) : rej(new Error(d.error || 'فشل الرفع'));
      };
      x.onerror = () => rej(new Error('فشل الاتصال بالسيرفر'));
      x.send(file);
    });
  },
};

/* تنسيقات */
const fmt = {
  size(b) {
    if (b == null) return '';
    const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return (i ? b.toFixed(b < 10 ? 1 : 0) : b) + ' ' + u[i];
  },
  date(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  },
  ext: n => (n.includes('.') ? n.split('.').pop().toLowerCase() : ''),
  base: p => p.split('/').pop(),
  dir: p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '',
  join: (a, b) => a ? a + '/' + b : b,
};

/* تنبيهات */
function toast(msg, type = '', ms = 3500) {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = msg;
  $('#toasts').appendChild(t);
  if (ms) setTimeout(() => t.remove(), ms);
  return t;
}
const toastErr = e => toast('⚠ ' + esc(e.message || e), 'err', 6000);

/* نوافذ */
const modal = {
  open(html, onMount) {
    $('#modalBox').innerHTML = html;
    $('#modal').hidden = false;
    onMount && onMount($('#modalBox'));
    const f = $('#modalBox input:not([type=checkbox]), #modalBox textarea');
    f && setTimeout(() => { f.focus(); f.select && f.select(); }, 30);
  },
  close() { $('#modal').hidden = true; $('#modalBox').innerHTML = ''; },
  prompt(title, value = '', placeholder = '') {
    return new Promise(res => {
      modal.open(`<h3>${esc(title)}</h3><input type="text" id="mIn" value="${esc(value)}" placeholder="${esc(placeholder)}">
        <div class="actions"><button class="btn primary" id="mOk">موافق</button><button class="btn" id="mNo">إلغاء</button></div>`, box => {
        const ok = () => { const v = $('#mIn').value.trim(); modal.close(); res(v || null); };
        $('#mOk').onclick = ok;
        $('#mNo').onclick = () => { modal.close(); res(null); };
        $('#mIn').onkeydown = e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') { modal.close(); res(null); } };
        // تحديد الاسم بدون الامتداد
        const i = $('#mIn'); const dot = value.lastIndexOf('.');
        setTimeout(() => { i.focus(); dot > 0 ? i.setSelectionRange(0, dot) : i.select(); }, 40);
      });
    });
  },
  confirm(title, text = '', okText = 'نعم', danger = false) {
    return new Promise(res => {
      modal.open(`<h3>${esc(title)}</h3><p class="muted">${text}</p>
        <div class="actions"><button class="btn ${danger ? 'danger' : 'primary'}" id="mOk">${esc(okText)}</button><button class="btn" id="mNo">إلغاء</button></div>`, () => {
        $('#mOk').onclick = () => { modal.close(); res(true); };
        $('#mNo').onclick = () => { modal.close(); res(false); };
        setTimeout(() => $('#mOk')?.focus(), 30);
      });
    });
  },
  /* اختيار مجلد */
  pickFolder(title) {
    return new Promise(res => {
      let cur = '';
      const render = async () => {
        const d = await api.list(cur);
        const dirs = d.items.filter(i => i.dir);
        const parts = cur ? cur.split('/') : [];
        $('#ftCrumb').innerHTML = `<button data-p="">🏠 الجذر</button>` + parts.map((p, i) => ` / <button data-p="${esc(parts.slice(0, i + 1).join('/'))}">${esc(p)}</button>`).join('');
        $('#ftList').innerHTML = (cur ? `<button data-p="${esc(fmt.dir(cur))}">⬆ ..</button>` : '') +
          (dirs.length ? dirs.map(i => `<button data-p="${esc(i.path)}">📁 ${esc(i.name)}</button>`).join('') : '<div class="muted" style="padding:8px">لا توجد مجلدات فرعية</div>');
        $('#ftCur').textContent = '/' + cur;
      };
      modal.open(`<h3>${esc(title)}</h3><div class="crumbs" id="ftCrumb" style="margin-bottom:8px"></div>
        <div class="folder-tree" id="ftList"></div><p class="muted">الوجهة: <b id="ftCur" dir="ltr"></b></p>
        <div class="actions"><button class="btn primary" id="mOk">اختيار هذا المجلد</button><button class="btn" id="mNo">إلغاء</button></div>`, box => {
        box.addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { cur = b.dataset.p; render(); } });
        $('#mOk').onclick = () => { modal.close(); res(cur); };
        $('#mNo').onclick = () => { modal.close(); res(null); };
        render();
      });
    });
  },
};
$('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') modal.close(); });

/* تنقل بين الصفحات */
const router = {
  handlers: {},
  current: null,
  guard: null, // دالة تمنع الخروج إذا في تعديلات غير محفوظة
  on(name, fn) { this.handlers[name] = fn; },
  async go() {
    const h = location.hash.replace(/^#\/?/, '') || 'home';
    const [name, ...rest] = h.split('/');
    const arg = decodeURIComponent(rest.join('/'));
    if (this.guard && this.current === 'editor' && name !== 'editor') {
      if (!(await this.guard())) { history.replaceState(null, '', '#/editor/' + encodeURIComponent(this.editorPath || '')); return; }
      this.guard = null;
    }
    $$('.view').forEach(v => v.classList.toggle('on', v.id === 'view-' + name));
    $$('nav a').forEach(a => a.classList.toggle('on', a.dataset.view === name || (name === 'editor' && a.dataset.view === 'files') || (name === 'tool' && a.dataset.view === 'tools')));
    this.current = name;
    this.handlers[name] && this.handlers[name](arg);
  },
  nav(h) { location.hash = h; },
};
window.addEventListener('hashchange', () => router.go());
window.addEventListener('beforeunload', e => { if (router.guard && router.current === 'editor' && window.__dirty) { e.preventDefault(); e.returnValue = ''; } });

/* إغلاق القوائم عند الضغط خارجها */
document.addEventListener('click', e => {
  $$('.dropdown.open').forEach(d => { if (!d.contains(e.target)) d.classList.remove('open'); });
  if (!e.target.closest('#ctx')) $('#ctx').hidden = true;
});
document.addEventListener('click', e => {
  const b = e.target.closest('.dropdown > .btn'); if (b) b.parentElement.classList.toggle('open');
});

/* أيقونات الملفات */
const ICONS = {
  dir: '📁', pdf: '📕', doc: '📘', docx: '📘', odt: '📘', rtf: '📘', xls: '📗', xlsx: '📗', xlsm: '📗', csv: '📗', ods: '📗',
  ppt: '📙', pptx: '📙', txt: '📄', md: '📝', json: '🧾', xml: '🧾', yml: '🧾', yaml: '🧾', ini: '⚙', conf: '⚙', cfg: '⚙', env: '⚙', log: '📜',
  js: '💻', ts: '💻', py: '🐍', html: '🌐', htm: '🌐', css: '🎨', sh: '💻', bat: '💻', ps1: '💻', php: '💻', java: '💻', c: '💻', cpp: '💻', go: '💻', rs: '💻', sql: '🗃',
  jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼', svg: '🖼', bmp: '🖼', ico: '🖼',
  mp3: '🎵', wav: '🎵', ogg: '🎵', m4a: '🎵', flac: '🎵', aac: '🎵', opus: '🎵',
  mp4: '🎬', webm: '🎬', mkv: '🎬', mov: '🎬', avi: '🎬',
  zip: '🗜', rar: '🗜', '7z': '🗜', tar: '🗜', gz: '🗜', exe: '⚙', msi: '⚙', iso: '💿',
};
const iconFor = item => item.dir ? ICONS.dir : (ICONS[item.ext] || '📄');
const TEXT_EXT = new Set(['txt', 'md', 'json', 'xml', 'yml', 'yaml', 'ini', 'conf', 'cfg', 'env', 'log', 'js', 'mjs', 'ts', 'py', 'html', 'htm', 'css', 'sh', 'bat', 'ps1', 'php', 'java', 'c', 'h', 'cpp', 'go', 'rs', 'sql', 'toml', 'csv_raw', 'srt', 'vtt', 'gitignore', 'dockerfile', 'properties']);
const IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mkv', 'mov', 'm4v']);
const SHEET_EXT = new Set(['xlsx', 'xlsm', 'xls', 'csv', 'ods', 'tsv']);
const editorKind = ext => {
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (SHEET_EXT.has(ext)) return 'sheet';
  if (IMG_EXT.has(ext)) return 'image';
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (TEXT_EXT.has(ext) || ext === '') return 'text';
  return null;
};

/* ساعة الشريط الجانبي */
setInterval(() => { $('#sideClock').textContent = new Date().toLocaleTimeString('en-GB'); }, 1000);
