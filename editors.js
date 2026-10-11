/* editors.js — محرر النصوص، Excel، Word، وعارض الوسائط */
'use strict';
const Editor = {
  path: null, item: null, impl: null,

  setDirty(d) {
    window.__dirty = d;
    const s = $('#edState');
    s.textContent = d ? '● تعديلات غير محفوظة' : 'محفوظ';
    s.className = d ? 'dirty' : '';
  },

  async open(path) {
    if (!path) return router.nav('#/files');
    this.path = path; router.editorPath = path;
    const name = fmt.base(path), ext = fmt.ext(name);
    $('#edName').textContent = name;
    $('#edTools').innerHTML = '';
    $('#edBody').innerHTML = '<div class="empty"><b>⏳</b>جاري الفتح…</div>';
    const kind = editorKind(ext);
    const impl = { text: TextEd, sheet: SheetEd, docx: DocxEd, pdf: typeof PdfEd !== 'undefined' ? PdfEd : null, image: MediaView, audio: MediaView, video: MediaView }[kind];
    if (!impl) { $('#edBody').innerHTML = '<div class="empty"><b>🤷</b>هذا النوع غير مدعوم للتعديل</div>'; return; }
    this.impl = impl;
    const ro = !!impl.readonly;
    $('#edSave').hidden = ro; $('#edSaveAs').hidden = ro;
    this.setDirty(false);
    if (ro) $('#edState').textContent = '';
    router.guard = async () => !window.__dirty || modal.confirm('في تعديلات غير محفوظة', 'إذا طلعت رح تضيع التعديلات. متأكد؟', 'اخرج بدون حفظ', true);
    try { await impl.mount($('#edBody'), path, ext); }
    catch (e) { console.error(e); $('#edBody').innerHTML = `<div class="empty"><b>⚠</b>تعذر فتح الملف: ${esc(e.message)}</div>`; }
  },

  async save(asCopy) {
    if (!this.impl || !this.impl.getBlob) return;
    let target = this.path;
    if (asCopy) {
      const name = fmt.base(this.path), dot = name.lastIndexOf('.');
      const n = await modal.prompt('حفظ كنسخة باسم', dot > 0 ? name.slice(0, dot) + ' - نسخة' + name.slice(dot) : name + ' - نسخة');
      if (!n) return;
      target = fmt.join(fmt.dir(this.path), n);
    }
    const btn = $('#edSave'); btn.disabled = true; btn.textContent = '⏳ حفظ…';
    try {
      const blob = await this.impl.getBlob(fmt.ext(target));
      if (asCopy) {
        const r = await api.upload(fmt.dir(this.path), new File([blob], fmt.base(target)));
        toast('تم الحفظ كنسخة: ' + esc(r.item.name), 'ok');
        this.setDirty(false);
        router.guard = null;
        router.nav('#/editor/' + encodeURIComponent(r.item.path));
      } else {
        await api.save(target, blob);
        this.setDirty(false);
        toast('تم الحفظ ✔ <small class="muted">(النسخة القديمة محفوظة بالسلة)</small>', 'ok');
        recent.add({ path: target, name: fmt.base(target), ext: fmt.ext(target) });
      }
    } catch (e) { toastErr(e); }
    finally { btn.disabled = false; btn.textContent = '💾 حفظ'; }
  },

  tools(html) { $('#edTools').innerHTML = html; },
};

$('#edSave').onclick = () => Editor.save(false);
$('#edSaveAs').onclick = () => Editor.save(true);
$('#edBack').onclick = () => { const d = fmt.dir(Editor.path || ''); router.nav('#/files'); setTimeout(() => Files.path !== d && Files.load(d), 0); };
document.addEventListener('keydown', e => {
  if (router.current === 'editor' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); Editor.save(false); }
});
router.on('editor', p => { if (p !== Editor.path || !Editor.impl) Editor.open(p); });

/* ===================== نص ===================== */
const TextEd = {
  async mount(el, path) {
    const txt = await api.fetchText(path);
    el.innerHTML = `<textarea class="text-ed" spellcheck="false" id="txt"></textarea>`;
    const ta = $('#txt'); ta.value = txt;
    Editor.tools(`<span class="muted" id="txtInfo"></span><button class="btn sm" id="txtWrap">↵ التفاف</button><button class="btn sm" id="txtDir">⇄ اتجاه</button>`);
    const info = () => { $('#txtInfo').textContent = `${ta.value.split('\n').length} سطر · ${ta.value.length} حرف`; };
    info();
    let wrap = store.get('wrap', true);
    const applyWrap = () => { ta.style.whiteSpace = wrap ? 'pre-wrap' : 'pre'; ta.style.overflowX = wrap ? 'hidden' : 'auto'; $('#txtWrap').classList.toggle('active', wrap); };
    applyWrap();
    $('#txtWrap').onclick = () => { wrap = !wrap; store.set('wrap', wrap); applyWrap(); };
    $('#txtDir').onclick = () => { ta.dir = ta.dir === 'rtl' ? 'ltr' : 'rtl'; ta.style.unicodeBidi = 'normal'; };
    ta.addEventListener('input', () => { Editor.setDirty(true); info(); });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('    ', ta.selectionStart, ta.selectionEnd, 'end'); Editor.setDirty(true); }
    });
    ta.focus();
    this.ta = ta;
  },
  async getBlob() { return new Blob([this.ta.value], { type: 'text/plain;charset=utf-8' }); },
};

/* ===================== وسائط (عرض فقط) ===================== */
const MediaView = {
  readonly: true,
  async mount(el, path, ext) {
    const url = await api.blobUrl(path);
    let inner;
    if (IMG_EXT.has(ext)) inner = `<img src="${url}" alt="">`;
    else if (AUDIO_EXT.has(ext)) inner = `<div style="text-align:center"><div style="font-size:80px">🎵</div><audio controls autoplay src="${url}" style="width:min(500px,90vw)"></audio></div>`;
    else inner = `<video controls autoplay src="${url}"></video>`;
    el.innerHTML = `<div class="viewer">${inner}</div>`;
    Editor.tools(`<button class="btn" id="mvDl">⬇ تنزيل</button>${navigator.share ? '<button class="btn" id="mvShare">📤 مشاركة</button>' : ''}`);
    $('#mvDl').onclick = () => api.download(path).catch(toastErr);
    if ($('#mvShare')) $('#mvShare').onclick = () => api.share(path).catch(e => e.name !== 'AbortError' && toastErr(e));
  },
};

/* ===================== Excel / CSV ===================== */
const SheetEd = {
  wb: null, ws: null, sheetName: null, sel: null, ext: null,
  MAX_ROWS: 3000, MAX_COLS: 200,

  async mount(el, path, ext) {
    this.ext = ext;
    const buf = await api.fetchBuffer(path);
    if (ext === 'csv' || ext === 'tsv') {
      const text = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
      this.wb = XLSX.read(text, { type: 'string', FS: ext === 'tsv' ? '\t' : undefined, raw: true });
    } else {
      this.wb = XLSX.read(buf, { type: 'array', cellFormula: true, cellStyles: true, cellDates: true, cellNF: true });
    }
    if (!this.wb.SheetNames.length) XLSX.utils.book_append_sheet(this.wb, XLSX.utils.aoa_to_sheet([['']]), 'Sheet1');
    el.innerHTML = `<div class="formula-bar"><b id="fxRef">A1</b><input id="fxIn" placeholder="قيمة أو معادلة مثل =SUM(A1:A5)"></div>
      <div class="sheet-wrap" id="sheetWrap"></div><div class="sheet-tabs" id="sheetTabs"></div>`;
    Editor.tools(`<button class="btn sm" id="shAddRow">+ صف</button><button class="btn sm" id="shAddCol">+ عمود</button>
      <button class="btn sm" id="shDelRow">− صف</button><button class="btn sm" id="shDelCol">− عمود</button>
      ${ext === 'csv' || ext === 'tsv' ? '' : '<button class="btn sm" id="shAddSheet">+ ورقة</button>'}
      <button class="btn sm" id="shSum" title="مجموع العمود المحدد">Σ</button>`);
    $('#shAddRow').onclick = () => this.insertRow();
    $('#shAddCol').onclick = () => this.insertCol();
    $('#shDelRow').onclick = () => this.deleteRow();
    $('#shDelCol').onclick = () => this.deleteCol();
    $('#shSum').onclick = () => this.sumCol();
    if ($('#shAddSheet')) $('#shAddSheet').onclick = async () => {
      const n = await modal.prompt('اسم الورقة', 'Sheet' + (this.wb.SheetNames.length + 1)); if (!n) return;
      if (this.wb.SheetNames.includes(n)) return toast('الاسم مستخدم', 'err');
      XLSX.utils.book_append_sheet(this.wb, XLSX.utils.aoa_to_sheet([['']]), n); Editor.setDirty(true); this.showSheet(n);
    };
    $('#fxIn').addEventListener('keydown', e => {
      if (e.key === 'Enter' && this.sel) { this.setCell(this.sel.r, this.sel.c, $('#fxIn').value); this.renderCell(this.sel.r, this.sel.c); this.move(1, 0); }
    });
    this.showSheet(this.wb.SheetNames[0]);
  },

  range() {
    const ref = this.ws['!ref'] || 'A1';
    return XLSX.utils.decode_range(ref);
  },

  showSheet(name) {
    this.sheetName = name; this.ws = this.wb.Sheets[name];
    this.recalc(false); // يحسب المعادلات اللي ما إلها قيمة محفوظة
    $('#sheetTabs').innerHTML = this.wb.SheetNames.map(n => `<button class="${n === name ? 'on' : ''}" data-s="${esc(n)}">${esc(n)}</button>`).join('');
    $('#sheetTabs').onclick = e => { const b = e.target.closest('[data-s]'); b && this.showSheet(b.dataset.s); };
    $('#sheetTabs').ondblclick = async e => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      const n = await modal.prompt('إعادة تسمية الورقة', b.dataset.s); if (!n || n === b.dataset.s || this.wb.SheetNames.includes(n)) return;
      const i = this.wb.SheetNames.indexOf(b.dataset.s); this.wb.SheetNames[i] = n; this.wb.Sheets[n] = this.wb.Sheets[b.dataset.s]; delete this.wb.Sheets[b.dataset.s];
      Editor.setDirty(true); this.showSheet(n);
    };
    this.render();
  },

  display(cell) {
    if (!cell) return '';
    if (cell.w != null && cell.t !== 's') return cell.w;
    if (cell.t === 'd' && cell.v instanceof Date) return cell.v.toLocaleDateString('en-GB');
    return cell.v == null ? '' : String(cell.v);
  },

  render() {
    const r = this.range();
    const rows = Math.min(Math.max(r.e.r + 1 + 20, 50), this.MAX_ROWS);
    const cols = Math.min(Math.max(r.e.c + 1 + 5, 15), this.MAX_COLS);
    this.dim = { rows, cols };
    let h = '<table class="sheet" dir="ltr"><thead><tr><th class="rh"></th>';
    for (let c = 0; c < cols; c++) h += `<th>${XLSX.utils.encode_col(c)}</th>`;
    h += '</tr></thead><tbody>';
    for (let rr = 0; rr < rows; rr++) {
      h += `<tr><td class="rh">${rr + 1}</td>`;
      for (let c = 0; c < cols; c++) {
        const cell = this.ws[XLSX.utils.encode_cell({ r: rr, c })];
        const cls = cell ? (cell.f ? 'f ' : '') + (cell.t === 'n' ? 'num' : '') : '';
        h += `<td class="${cls}" data-r="${rr}" data-c="${c}"><div class="c" contenteditable="true">${esc(this.display(cell))}</div></td>`;
      }
      h += '</tr>';
    }
    h += '</tbody></table>';
    if (r.e.r + 1 > this.MAX_ROWS) h += `<div class="muted" style="padding:10px">يعرض أول ${this.MAX_ROWS} صف فقط (الباقي محفوظ ولن يُحذف)</div>`;
    const wrap = $('#sheetWrap'); wrap.innerHTML = h; this.sel = null;

    if (wrap._bound) return; wrap._bound = true;
    wrap.addEventListener('focusin', e => {
      const td = e.target.closest('td[data-r]'); if (!td) return;
      this.sel = { r: +td.dataset.r, c: +td.dataset.c, td };
      const cell = this.ws[XLSX.utils.encode_cell(this.sel)];
      $('#fxRef').textContent = XLSX.utils.encode_cell(this.sel);
      $('#fxIn').value = cell ? (cell.f ? '=' + cell.f : (cell.v instanceof Date ? cell.v.toISOString().slice(0, 10) : (cell.v ?? ''))) : '';
      // عند التعديل، اعرض المعادلة بدل الناتج
      if (cell && cell.f) td.firstChild.textContent = '=' + cell.f;
      td.dataset.orig = td.firstChild.textContent;
    });
    wrap.addEventListener('focusout', e => {
      const td = e.target.closest('td[data-r]'); if (!td) return;
      const val = td.firstChild.innerText.replace(/\n$/, '');
      if (val !== td.dataset.orig) this.setCell(+td.dataset.r, +td.dataset.c, val);
      this.renderCell(+td.dataset.r, +td.dataset.c);
    });
    wrap.onkeydown = e => {
      const td = e.target.closest('td[data-r]'); if (!td) return;
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.move(1, 0); }
      else if (e.key === 'Tab') { e.preventDefault(); this.move(0, e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { td.firstChild.textContent = td.dataset.orig; td.firstChild.blur(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.move(e.key === 'ArrowDown' ? 1 : -1, 0); }
    };
    wrap.onpaste = e => {
      const td = e.target.closest('td[data-r]'); if (!td) return;
      const text = e.clipboardData.getData('text/plain');
      if (!text.includes('\t') && !text.includes('\n')) return; // لصق عادي
      e.preventDefault();
      const r0 = +td.dataset.r, c0 = +td.dataset.c;
      text.replace(/\r/g, '').replace(/\n$/, '').split('\n').forEach((line, i) => line.split('\t').forEach((v, j) => this.setCell(r0 + i, c0 + j, v)));
      this.render();
    };
  },

  renderCell(r, c) {
    const td = $(`#sheetWrap td[data-r="${r}"][data-c="${c}"]`); if (!td) return;
    const cell = this.ws[XLSX.utils.encode_cell({ r, c })];
    const editing = td.contains(document.activeElement);
    td.firstChild.textContent = editing && cell && cell.f ? '=' + cell.f : this.display(cell);
    if (editing) td.dataset.orig = td.firstChild.textContent;
    td.className = cell ? (cell.f ? 'f ' : '') + (cell.t === 'n' ? 'num' : '') : '';
  },

  move(dr, dc) {
    if (!this.sel) return;
    const r = Math.max(0, Math.min(this.dim.rows - 1, this.sel.r + dr)), c = Math.max(0, Math.min(this.dim.cols - 1, this.sel.c + dc));
    const td = $(`#sheetWrap td[data-r="${r}"][data-c="${c}"]`);
    if (td) { td.firstChild.focus(); const rg = document.createRange(); rg.selectNodeContents(td.firstChild); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); }
  },

  setCell(r, c, raw) {
    const addr = XLSX.utils.encode_cell({ r, c });
    raw = raw ?? '';
    const old = this.ws[addr];
    if (raw === '') { delete this.ws[addr]; }
    else if (raw.startsWith('=') && raw.length > 1) {
      this.ws[addr] = { t: 'n', f: raw.slice(1), v: this.evalSimple(raw.slice(1)) };
      const v = this.ws[addr].v; if (v == null) { this.ws[addr].v = 0; this.ws[addr].w = '=' + raw.slice(1); } else this.ws[addr].w = String(v);
    } else if (/^-?\d+([.,]\d+)?$/.test(raw.trim()) && this.ext !== 'csv') {
      const n = parseFloat(raw.replace(',', '.'));
      this.ws[addr] = { t: 'n', v: n, w: raw.trim() };
      if (old && old.z) this.ws[addr].z = old.z;
    } else {
      this.ws[addr] = { t: 's', v: raw, w: raw };
    }
    if (old && old.s && this.ws[addr]) this.ws[addr].s = old.s;
    // توسيع النطاق
    const rg = this.range();
    if (raw !== '') { rg.e.r = Math.max(rg.e.r, r); rg.e.c = Math.max(rg.e.c, c); }
    this.ws['!ref'] = XLSX.utils.encode_range(rg);
    Editor.setDirty(true);
    if (r >= this.dim.rows - 3 || c >= this.dim.cols - 2) setTimeout(() => this.render(), 0);
    else this.recalc();
  },

  /* حساب بسيط للمعادلات الشائعة للعرض الفوري (Excel يعيد الحساب عند الفتح) */
  num(addr) { const c = this.ws[addr.toUpperCase()]; return c && typeof c.v === 'number' ? c.v : (c && !isNaN(+c.v) && c.v !== '' ? +c.v : 0); },
  rangeVals(ref) {
    const rg = XLSX.utils.decode_range(ref.toUpperCase()); const out = [];
    for (let r = rg.s.r; r <= rg.e.r; r++) for (let c = rg.s.c; c <= rg.e.c; c++) { const cell = this.ws[XLSX.utils.encode_cell({ r, c })]; if (cell && cell.v !== '' && !isNaN(+cell.v)) out.push(+cell.v); }
    return out;
  },
  evalSimple(f) {
    try {
      const fns = { SUM: a => a.reduce((s, x) => s + x, 0), AVERAGE: a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0, MIN: a => Math.min(...a), MAX: a => Math.max(...a), COUNT: a => a.length };
      let e = f.replace(/(SUM|AVERAGE|MIN|MAX|COUNT)\(([A-Z]+\d+:[A-Z]+\d+)\)/gi, (_, fn, rg) => String(fns[fn.toUpperCase()](this.rangeVals(rg))));
      e = e.replace(/\$?([A-Z]{1,3})\$?(\d+)/gi, (_, c, r) => String(this.num(c + r)));
      if (!/^[\d+\-*/().\s]+$/.test(e)) return null;
      const v = Function('"use strict";return (' + e + ')')();
      return Number.isFinite(v) ? Math.round(v * 1e10) / 1e10 : null;
    } catch { return null; }
  },
  recalc(render) {
    for (const k of Object.keys(this.ws)) {
      if (k[0] === '!') continue; const c = this.ws[k];
      if (c.f) { const v = this.evalSimple(c.f); if (v != null) { c.v = v; c.w = String(v); c.t = 'n'; if (render !== false) { const d = XLSX.utils.decode_cell(k); this.renderCell(d.r, d.c); } } }
    }
  },

  shift(axis, at, delta) {
    // ينقل الخلايا لإدراج/حذف صف أو عمود
    const rg = this.range();
    const cells = {};
    for (const k of Object.keys(this.ws)) { if (k[0] !== '!') { cells[k] = this.ws[k]; delete this.ws[k]; } }
    for (const [k, v] of Object.entries(cells)) {
      const d = XLSX.utils.decode_cell(k); const pos = axis === 'r' ? d.r : d.c;
      if (delta < 0 && pos === at) continue;
      if (pos >= at + (delta < 0 ? 1 : 0)) axis === 'r' ? d.r += delta : d.c += delta;
      this.ws[XLSX.utils.encode_cell(d)] = v;
    }
    if (axis === 'r') rg.e.r = Math.max(0, rg.e.r + delta); else rg.e.c = Math.max(0, rg.e.c + delta);
    this.ws['!ref'] = XLSX.utils.encode_range(rg);
    delete this.ws['!merges'];
    Editor.setDirty(true); this.render();
  },
  insertRow() { this.shift('r', this.sel ? this.sel.r + 1 : this.range().e.r + 1, 1); },
  insertCol() { this.shift('c', this.sel ? this.sel.c + 1 : this.range().e.c + 1, 1); },
  deleteRow() { if (!this.sel) return toast('اختر خلية أولاً'); this.shift('r', this.sel.r, -1); },
  deleteCol() { if (!this.sel) return toast('اختر خلية أولاً'); this.shift('c', this.sel.c, -1); },
  sumCol() {
    if (!this.sel) return toast('اختر خلية في العمود');
    const col = XLSX.utils.encode_col(this.sel.c); const rg = this.range();
    let last = -1; for (let r = 0; r <= rg.e.r; r++) if (this.ws[col + (r + 1)]) last = r;
    if (last < 0) return toast('العمود فارغ');
    this.setCell(last + 1, this.sel.c, `=SUM(${col}1:${col}${last + 1})`); this.render();
  },

  async getBlob(ext) {
    if (document.activeElement && document.activeElement.closest('#sheetWrap')) document.activeElement.blur();
    if (ext === 'csv' || ext === 'tsv') {
      const csv = XLSX.utils.sheet_to_csv(this.ws, { FS: ext === 'tsv' ? '\t' : ',' });
      return new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM عشان Excel يقرأ العربي صح
    }
    const bookType = { xls: 'biff8', ods: 'ods', xlsm: 'xlsm' }[ext] || 'xlsx';
    return new Blob([XLSX.write(this.wb, { type: 'array', bookType, cellStyles: true })]);
  },
};

/* ===================== Word ===================== */
const DocxEd = {
  async mount(el, path) {
    const buf = await api.fetchBuffer(path);
    let html = '';
    if (buf.byteLength) {
      const res = await mammoth.convertToHtml({ arrayBuffer: buf }, {
        styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh", "u => u", "strike => s"],
      });
      html = res.value;
    }
    el.innerHTML = `<div class="doc-tools" id="docTools">
        <button class="btn sm" data-cmd="undo" title="تراجع">↶</button><button class="btn sm" data-cmd="redo" title="إعادة">↷</button>
        <select id="docBlock" title="نوع الفقرة"><option value="p">نص عادي</option><option value="h1">عنوان 1</option><option value="h2">عنوان 2</option><option value="h3">عنوان 3</option><option value="blockquote">اقتباس</option></select>
        <select id="docSize" title="حجم الخط"><option value="">الحجم</option><option value="2">صغير</option><option value="3">عادي</option><option value="4">متوسط</option><option value="5">كبير</option><option value="6">كبير جداً</option></select>
        <button class="btn sm" data-cmd="bold" title="عريض"><b>B</b></button><button class="btn sm" data-cmd="italic" title="مائل"><i>I</i></button>
        <button class="btn sm" data-cmd="underline" title="تسطير"><u>U</u></button><button class="btn sm" data-cmd="strikeThrough" title="يتوسطه خط"><s>S</s></button>
        <label class="btn sm" title="لون الخط">A<input type="color" id="docColor" value="#c00000" style="width:22px;height:18px;padding:0;border:0"></label>
        <label class="btn sm" title="تظليل">🖍<input type="color" id="docHl" value="#ffff00" style="width:22px;height:18px;padding:0;border:0"></label>
        <button class="btn sm" data-cmd="justifyRight" title="يمين">⇥</button><button class="btn sm" data-cmd="justifyCenter" title="وسط">≡</button>
        <button class="btn sm" data-cmd="justifyLeft" title="يسار">⇤</button><button class="btn sm" data-cmd="justifyFull" title="ضبط">☰</button>
        <button class="btn sm" data-dir="rtl" title="من اليمين لليسار">RTL</button><button class="btn sm" data-dir="ltr" title="من اليسار لليمين">LTR</button>
        <button class="btn sm" data-cmd="insertUnorderedList" title="قائمة نقطية">• ─</button><button class="btn sm" data-cmd="insertOrderedList" title="قائمة مرقمة">1. ─</button>
        <button class="btn sm" data-cmd="outdent" title="إنقاص المسافة">⇠</button><button class="btn sm" data-cmd="indent" title="زيادة المسافة">⇢</button>
        <button class="btn sm" id="docTable" title="إدراج جدول">▦</button><button class="btn sm" id="docImg" title="إدراج صورة">🖼</button>
        <button class="btn sm" id="docLink" title="رابط">🔗</button><button class="btn sm" data-cmd="insertHorizontalRule" title="خط فاصل">―</button>
        <button class="btn sm" data-cmd="removeFormat" title="إزالة التنسيق">⌫</button>
        <input type="file" id="docImgIn" accept="image/*" hidden>
      </div>
      <div class="doc-wrap"><div class="doc-page" id="docPage" contenteditable="true" spellcheck="true"></div></div>`;
    const page = $('#docPage');
    page.innerHTML = html || '<p><br></p>';
    $$('p,h1,h2,h3,h4,h5,h6,li,td,th', page).forEach(n => n.setAttribute('dir', 'auto'));
    Editor.tools(`<button class="btn" id="docPrint" title="طباعة / حفظ PDF">🖨 PDF</button>`);
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('defaultParagraphSeparator', false, 'p');
    this.page = page;
    const dirty = () => Editor.setDirty(true);
    page.addEventListener('input', dirty);
    const keepSel = e => e.preventDefault(); // يحافظ على التحديد عند الضغط على الأزرار
    $('#docTools').addEventListener('mousedown', e => { if (e.target.closest('button')) keepSel(e); });
    $('#docTools').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.cmd) { page.focus(); document.execCommand(b.dataset.cmd, false, null); dirty(); }
      if (b.dataset.dir) {
        const s = getSelection(); if (!s.rangeCount) return;
        let n = s.anchorNode; n = n.nodeType === 3 ? n.parentNode : n;
        const blk = n.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,div.doc-page');
        if (blk && blk !== page) { blk.setAttribute('dir', b.dataset.dir); blk.style.textAlign = b.dataset.dir === 'rtl' ? 'right' : 'left'; dirty(); }
      }
    });
    $('#docBlock').onchange = e => { page.focus(); document.execCommand('formatBlock', false, e.target.value); e.target.value = 'p'; dirty(); };
    $('#docSize').onchange = e => { if (!e.target.value) return; page.focus(); document.execCommand('fontSize', false, e.target.value); e.target.value = ''; dirty(); };
    let saved;
    const saveSel = () => { const s = getSelection(); if (s.rangeCount && page.contains(s.anchorNode)) saved = s.getRangeAt(0).cloneRange(); };
    const restore = () => { page.focus(); if (saved) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); } };
    page.addEventListener('keyup', saveSel); page.addEventListener('mouseup', saveSel);
    $('#docColor').oninput = e => { restore(); document.execCommand('foreColor', false, e.target.value); dirty(); };
    $('#docHl').oninput = e => { restore(); document.execCommand('styleWithCSS', false, true); document.execCommand('hiliteColor', false, e.target.value); document.execCommand('styleWithCSS', false, false); dirty(); };
    $('#docTable').onclick = async () => {
      saveSel();
      const v = await modal.prompt('حجم الجدول (صفوف × أعمدة)', '3x3'); if (!v) return;
      const [r, c] = v.split(/[x×*]/).map(n => Math.max(1, Math.min(50, parseInt(n) || 3)));
      const row = '<tr>' + '<td dir="auto"><br></td>'.repeat(c) + '</tr>';
      restore(); document.execCommand('insertHTML', false, `<table>${row.repeat(r)}</table><p><br></p>`); dirty();
    };
    $('#docImg').onclick = () => { saveSel(); $('#docImgIn').click(); };
    $('#docImgIn').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader(); rd.onload = () => { restore(); document.execCommand('insertImage', false, rd.result); dirty(); };
      rd.readAsDataURL(f); e.target.value = '';
    };
    $('#docLink').onclick = async () => { saveSel(); const u = await modal.prompt('الرابط', 'https://'); if (!u) return; restore(); document.execCommand('createLink', false, u); dirty(); };
    $('#docPrint').onclick = () => this.print();
    page.focus();
  },

  print() {
    const w = window.open('', '_blank');
    w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${esc(fmt.base(Editor.path))}</title>
      <style>body{font-family:Calibri,"Segoe UI",Arial,sans-serif;line-height:1.6;margin:0}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px}img{max-width:100%}@page{margin:2cm}</style></head>
      <body>${this.page.innerHTML}</body></html>`);
    w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 300);
  },

  async getBlob() { return DocxWriter.fromElement(this.page); },
};
