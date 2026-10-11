/* pdf-editor.js — محرر PDF: عرض، إضافة نص (يدعم العربي)، توقيع، صور، تظليل، تبييض،
   تدوير/حذف/ترتيب/إدراج صفحات، دمج، استخراج صفحات، تصدير صفحة كصورة */
'use strict';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

const PdfEd = {
  srcs: [],       // [{bytes:Uint8Array, js:PDFDocumentProxy}]
  pages: [],      // [{src, idx, extra, ov:[...], baseRot, w, h}]
  cur: 0, picked: new Set(), tool: null, scale: 1.4, structural: false, ovSeq: 1,

  async mount(el, path) {
    Object.assign(this, { srcs: [], pages: [], cur: 0, picked: new Set(), tool: null, structural: false });
    const bytes = new Uint8Array(await api.fetchBuffer(path));
    if (bytes.length === 0) {
      const d = await PDFLib.PDFDocument.create(); d.addPage(PDFLib.PageSizes.A4);
      this.pages = await this.addSource(await d.save());
    } else this.pages = await this.addSource(bytes);
    this.structural = false;

    el.innerHTML = `<div class="doc-tools" id="pdfTools">
        <button class="btn sm" data-tool="text" title="اضغط على الصفحة لإضافة نص">✍ نص</button>
        <button class="btn sm" data-tool="sign" title="ارسم توقيعك">✒ توقيع</button>
        <button class="btn sm" data-tool="image" title="إدراج صورة">🖼 صورة</button>
        <button class="btn sm" data-tool="hl" title="اسحب لتظليل">🖍 تظليل</button>
        <button class="btn sm" data-tool="white" title="اسحب لتغطية/مسح جزء بالأبيض">⬜ تبييض</button>
        <span class="muted">|</span>
        <button class="btn sm" data-op="rotL" title="تدوير يسار">⟲</button><button class="btn sm" data-op="rotR" title="تدوير يمين">⟳</button>
        <button class="btn sm" data-op="up" title="تحريك الصفحة للأعلى">▲</button><button class="btn sm" data-op="down" title="تحريك للأسفل">▼</button>
        <button class="btn sm" data-op="blank" title="إدراج صفحة فارغة بعد الحالية">+ صفحة</button>
        <button class="btn sm" data-op="insert" title="إدراج ملف PDF آخر بعد الحالية">+ PDF</button>
        <button class="btn sm danger" data-op="del" title="حذف الصفحة / الصفحات المحددة">🗑 حذف</button>
        <span class="muted">|</span>
        <button class="btn sm" data-op="extract" title="حفظ الصفحات المحددة كملف جديد">✂ استخراج</button>
        <button class="btn sm" data-op="png" title="حفظ الصفحة كصورة PNG">📷 صورة</button>
        <span class="spacer"></span>
        <button class="btn sm" data-op="zoomOut">−</button><span class="muted" id="pdfZoom"></span><button class="btn sm" data-op="zoomIn">+</button>
        <input type="file" id="pdfImgIn" accept="image/png,image/jpeg" hidden><input type="file" id="pdfIn" accept="application/pdf" hidden>
      </div>
      <div class="pdf-layout"><div class="pdf-thumbs" id="pdfThumbs"></div><div class="pdf-main" id="pdfMain"></div></div>`;
    Editor.tools(`<span class="muted" id="pdfInfo"></span>`);
    $('#pdfTools').onclick = e => {
      const t = e.target.closest('[data-tool]'), o = e.target.closest('[data-op]');
      if (t) this.setTool(this.tool === t.dataset.tool ? null : t.dataset.tool);
      if (o) this.op(o.dataset.op);
    };
    $('#pdfImgIn').onchange = e => this.onImage(e);
    $('#pdfIn').onchange = e => this.onInsertPdf(e);
    this.fitScale();
    this.layout();
  },

  async addSource(bytes) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let js;
    try { js = await pdfjsLib.getDocument({ data: bytes.slice() }).promise; }
    catch (e) { throw new Error(e.name === 'PasswordException' ? 'الملف محمي بكلمة سر' : 'ملف PDF تالف أو غير مدعوم'); }
    const si = this.srcs.push({ bytes, js }) - 1;
    const out = [];
    for (let i = 0; i < js.numPages; i++) {
      const p = await js.getPage(i + 1);
      const vp = p.getViewport({ scale: 1, rotation: 0 });
      out.push({ src: si, idx: i, extra: 0, baseRot: p.rotate, ov: [], w: vp.width, h: vp.height });
    }
    return out;
  },

  fitScale() {
    const main = $('#pdfMain'); if (!main || !this.pages.length) return;
    const avail = main.clientWidth - 60;
    const widest = Math.max(...this.pages.map(p => this.rot(p) % 180 ? p.h : p.w));
    this.scale = Math.max(0.4, Math.min(2.2, avail / widest));
  },

  setTool(t) {
    this.tool = t;
    $$('#pdfTools [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    $$('.pdf-page').forEach(p => p.classList.toggle('adding', !!t));
    if (t === 'image') { $('#pdfImgIn').click(); }
    if (t === 'sign') this.signPad();
    if (t === 'text') toast('اضغط على المكان بالصفحة اللي بدك تكتب فيه');
    if (t === 'hl' || t === 'white') toast('اسحب بالماوس على المنطقة');
  },

  rot(p) { return (((p.baseRot + p.extra) % 360) + 360) % 360; },
  async jsPage(p) { return this.srcs[p.src].js.getPage(p.idx + 1); },

  /* ---------- العرض ---------- */
  layout() {
    $('#pdfZoom').textContent = Math.round(this.scale * 100) + '%';
    $('#pdfInfo').textContent = `${this.pages.length} صفحة`;
    const main = $('#pdfMain'), thumbs = $('#pdfThumbs');
    main.innerHTML = ''; thumbs.innerHTML = '';
    this.io && this.io.disconnect();
    this.io = new IntersectionObserver(ents => ents.forEach(en => {
      if (en.isIntersecting) { this.io.unobserve(en.target); this.renderPage(+en.target.dataset.i, en.target); }
    }), { root: main, rootMargin: '600px' });
    this.tio && this.tio.disconnect();
    this.tio = new IntersectionObserver(ents => ents.forEach(en => {
      if (en.isIntersecting) { this.tio.unobserve(en.target); this.renderThumb(+en.target.dataset.i, en.target); }
    }), { root: thumbs, rootMargin: '400px' });

    this.pages.forEach((p, i) => {
      const r = this.rot(p) % 180 !== 0;
      const W = Math.floor((r ? p.h : p.w) * this.scale), H = Math.floor((r ? p.w : p.h) * this.scale);
      const div = document.createElement('div');
      div.className = 'pdf-page' + (this.tool ? ' adding' : ''); div.dataset.i = i;
      div.style.width = W + 'px'; div.style.height = H + 'px';
      main.appendChild(div);
      this.io.observe(div);

      const t = document.createElement('div');
      t.className = 'pdf-thumb' + (i === this.cur ? ' on' : '') + (this.picked.has(p) ? ' picked' : '');
      t.dataset.i = i; t.draggable = true;
      t.innerHTML = `<input type="checkbox" ${this.picked.has(p) ? 'checked' : ''} title="تحديد"><canvas style="aspect-ratio:${W}/${H}"></canvas><small>${i + 1}</small>`;
      thumbs.appendChild(t);
      this.tio.observe(t);
    });
    this.bindThumbs();
    this.bindMain();
    const curEl = main.children[this.cur]; curEl && curEl.scrollIntoView({ block: 'nearest' });
  },

  async renderPage(i, div) {
    const p = this.pages[i]; if (!p) return;
    const page = await this.jsPage(p);
    const vp = page.getViewport({ scale: this.scale, rotation: this.rot(p) });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = document.createElement('canvas');
    c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr);
    c.style.width = vp.width + 'px'; c.style.height = vp.height + 'px';
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
    div.innerHTML = ''; div.appendChild(c);
    div._vp = vp;
    p.ov.forEach(o => this.drawOv(div, o));
  },

  async renderThumb(i, el) {
    const p = this.pages[i]; if (!p) return;
    const page = await this.jsPage(p);
    const vp = page.getViewport({ scale: 0.3, rotation: this.rot(p) });
    const c = $('canvas', el); c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  },

  bindThumbs() {
    const th = $('#pdfThumbs');
    th.onclick = e => {
      const t = e.target.closest('.pdf-thumb'); if (!t) return;
      const i = +t.dataset.i, p = this.pages[i];
      if (e.target.matches('input')) { e.target.checked ? this.picked.add(p) : this.picked.delete(p); t.classList.toggle('picked', e.target.checked); return; }
      this.cur = i; $$('.pdf-thumb').forEach(x => x.classList.toggle('on', x === t));
      $('#pdfMain').children[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    let from = null;
    th.ondragstart = e => { const t = e.target.closest('.pdf-thumb'); from = t ? +t.dataset.i : null; };
    th.ondragover = e => e.preventDefault();
    th.ondrop = e => {
      e.preventDefault(); const t = e.target.closest('.pdf-thumb'); if (from == null || !t) return;
      const to = +t.dataset.i; if (to === from) return;
      const [p] = this.pages.splice(from, 1); this.pages.splice(to, 0, p);
      this.cur = to; this.changed(true);
    };
  },

  bindMain() {
    const main = $('#pdfMain');
    main.onscroll = () => {
      clearTimeout(this._st); this._st = setTimeout(() => {
        const mid = main.scrollTop + main.clientHeight / 3;
        const kids = [...main.children]; const i = kids.findIndex(k => k.offsetTop + k.offsetHeight > mid);
        if (i >= 0 && i !== this.cur) { this.cur = i; $$('.pdf-thumb').forEach((x, j) => x.classList.toggle('on', j === i)); $$('.pdf-thumb')[i]?.scrollIntoView({ block: 'nearest' }); }
      }, 100);
    };
    main.onpointerdown = e => {
      const pg = e.target.closest('.pdf-page');
      if (!e.target.closest('.ov')) $$('.ov.on').forEach(o => o.classList.remove('on'));
      if (!pg || !this.tool || e.target.closest('.ov') || !pg._vp) return;
      const i = +pg.dataset.i; this.cur = i;
      const r = pg.getBoundingClientRect(); const x0 = e.clientX - r.left, y0 = e.clientY - r.top;
      if (this.tool === 'text') { this.textDialog(i, x0, y0); return; }
      if (this.tool === 'sign' && this.pendingImg) { this.placeImage(i, x0, y0, this.pendingImg); return; }
      if (this.tool === 'image' && this.pendingImg) { this.placeImage(i, x0, y0, this.pendingImg); return; }
      if (this.tool === 'hl' || this.tool === 'white') {
        const box = document.createElement('div'); box.className = 'ov on';
        box.style.cssText = `left:${x0}px;top:${y0}px;width:0;height:0;background:${this.tool === 'hl' ? 'rgba(255,230,0,.4)' : '#fff'};border-color:var(--accent)`;
        pg.appendChild(box); pg.setPointerCapture(e.pointerId);
        const mv = ev => { const x = ev.clientX - r.left, y = ev.clientY - r.top; box.style.left = Math.min(x, x0) + 'px'; box.style.top = Math.min(y, y0) + 'px'; box.style.width = Math.abs(x - x0) + 'px'; box.style.height = Math.abs(y - y0) + 'px'; };
        const up = () => {
          pg.removeEventListener('pointermove', mv); pg.removeEventListener('pointerup', up);
          const L = parseFloat(box.style.left), T = parseFloat(box.style.top), W = parseFloat(box.style.width), H = parseFloat(box.style.height);
          box.remove();
          if (W < 4 || H < 4) return;
          const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d');
          g.fillStyle = this.tool === 'hl' ? 'rgba(255,230,0,0.4)' : '#ffffff'; g.fillRect(0, 0, 4, 4);
          this.addOv(i, { L, T, W, H }, c.toDataURL('image/png'), { kind: this.tool });
        };
        pg.addEventListener('pointermove', mv); pg.addEventListener('pointerup', up);
      }
    };
  },

  /* ---------- العناصر المضافة (overlays) ---------- */
  // تحويل مستطيل العرض (px) إلى إحداثيات PDF مع زاوية الدوران الحالية
  addOv(i, rect, png, meta) {
    const pg = $(`#pdfMain .pdf-page[data-i="${i}"]`); const vp = pg._vp; const p = this.pages[i];
    const [x, y] = vp.convertToPdfPoint(rect.L, rect.T + rect.H);
    const o = { id: this.ovSeq++, x, y, w: rect.W / this.scale, h: rect.H / this.scale, rot: this.rot(p), png, meta };
    p.ov.push(o); this.drawOv(pg, o); Editor.setDirty(true);
    return o;
  },

  ovRect(vp, o) {
    // الزوايا الأربعة بالإحداثيات المعروضة
    const R = o.rot * Math.PI / 180, c = Math.cos(R), s = Math.sin(R);
    const pts = [[0, 0], [o.w, 0], [o.w, o.h], [0, o.h]].map(([a, b]) => vp.convertToViewportPoint(o.x + a * c - b * s, o.y + a * s + b * c));
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    return { L: Math.min(...xs), T: Math.min(...ys), W: Math.max(...xs) - Math.min(...xs), H: Math.max(...ys) - Math.min(...ys) };
  },

  drawOv(pg, o) {
    const vp = pg._vp; if (!vp) return;
    const p = this.pages[+pg.dataset.i];
    let el = pg.querySelector(`.ov[data-id="${o.id}"]`);
    if (!el) {
      el = document.createElement('div'); el.className = 'ov'; el.dataset.id = o.id;
      el.innerHTML = `<img alt=""><button class="x" title="حذف">✕</button><span class="rs"></span>`;
      pg.appendChild(el);
      this.bindOv(pg, el, o);
    }
    const r = this.ovRect(vp, o);
    const delta = ((this.rot(p) - o.rot) % 360 + 360) % 360;
    Object.assign(el.style, { left: r.L + 'px', top: r.T + 'px', width: r.W + 'px', height: r.H + 'px' });
    const img = $('img', el); img.src = o.png;
    if (delta) {
      const sw = delta % 180 ? r.H : r.W, sh = delta % 180 ? r.W : r.H;
      Object.assign(img.style, { position: 'absolute', width: sw + 'px', height: sh + 'px', left: (r.W - sw) / 2 + 'px', top: (r.H - sh) / 2 + 'px', transform: `rotate(${delta}deg)` });
      $('.rs', el).style.visibility = 'hidden';
    } else { img.removeAttribute('style'); $('.rs', el).style.visibility = ''; }
  },

  bindOv(pg, el, o) {
    const p = () => this.pages[+pg.dataset.i];
    $('.x', el).onpointerdown = e => { e.stopPropagation(); };
    $('.x', el).onclick = e => { e.stopPropagation(); p().ov = p().ov.filter(x => x !== o); el.remove(); Editor.setDirty(true); };
    el.ondblclick = () => { if (o.meta && o.meta.kind === 'text') this.textDialog(+pg.dataset.i, 0, 0, o); };
    el.onpointerdown = e => {
      if (e.target.classList.contains('x')) return;
      e.stopPropagation(); e.preventDefault();
      $$('.ov.on').forEach(x => x !== el && x.classList.remove('on')); el.classList.add('on');
      const resizing = e.target.classList.contains('rs');
      const vp = pg._vp, sx = e.clientX, sy = e.clientY;
      const start = { x: o.x, y: o.y, w: o.w, h: o.h };
      const r0 = this.ovRect(vp, o);
      el.setPointerCapture(e.pointerId);
      const mv = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (resizing) {
          let W = Math.max(8, r0.W + dx), H = Math.max(8, r0.H + dy);
          if (o.meta && (o.meta.kind === 'text' || o.meta.kind === 'sign' || o.meta.kind === 'image') && !ev.shiftKey) H = W * r0.H / r0.W; // حفظ النسبة
          const [x, y] = vp.convertToPdfPoint(r0.L, r0.T + H);
          Object.assign(o, { x, y, w: W / this.scale, h: H / this.scale });
        } else {
          const [ax, ay] = vp.convertToPdfPoint(0, 0), [bx, by] = vp.convertToPdfPoint(dx, dy);
          o.x = start.x + (bx - ax); o.y = start.y + (by - ay);
        }
        this.drawOv(pg, o);
      };
      const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); if (o.x !== start.x || o.y !== start.y || o.w !== start.w) Editor.setDirty(true); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
    };
  },

  /* ---------- نص ---------- */
  textDialog(i, x0, y0, existing) {
    const m = existing?.meta || store.get('pdfText', { text: '', size: 14, color: '#000000', bold: false, font: 'Arial' });
    modal.open(`<h3>${existing ? 'تعديل النص' : 'إضافة نص'}</h3>
      <textarea id="tTxt" rows="4" dir="auto" style="width:100%" placeholder="اكتب هنا… (يدعم العربي والإنجليزي وعدة أسطر)">${esc(existing ? m.text : '')}</textarea>
      <div class="form-grid" style="margin-top:12px">
        <label>الحجم (pt)<input id="tSize" type="number" min="5" max="120" value="${m.size}"></label>
        <label>اللون<input id="tColor" type="color" value="${m.color}" style="height:38px"></label>
        <label>الخط<select id="tFont">${['Arial', 'Times New Roman', 'Tahoma', 'Segoe UI', 'Courier New', 'Calibri'].map(f => `<option ${f === m.font ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" id="tBold" ${m.bold ? 'checked' : ''}> عريض</label>
      </div>
      <div class="actions"><button class="btn primary" id="mOk">${existing ? 'تحديث' : 'إضافة'}</button><button class="btn" id="mNo">إلغاء</button></div>`, () => {
      $('#mNo').onclick = () => modal.close();
      $('#mOk').onclick = () => {
        const meta = { kind: 'text', text: $('#tTxt').value, size: +$('#tSize').value || 14, color: $('#tColor').value, bold: $('#tBold').checked, font: $('#tFont').value };
        modal.close();
        if (!meta.text.trim()) return;
        store.set('pdfText', { ...meta, text: '' });
        const { url, w, h } = this.textPng(meta);
        if (existing) {
          // نستبدل العنصر القديم بنفس الموقع (الزاوية العليا)
          const pg = $(`#pdfMain .pdf-page[data-i="${i}"]`);
          const r = this.ovRect(pg._vp, existing);
          this.pages[i].ov = this.pages[i].ov.filter(x => x !== existing);
          pg.querySelector(`.ov[data-id="${existing.id}"]`)?.remove();
          this.addOv(i, { L: r.L, T: r.T, W: w * this.scale, H: h * this.scale }, url, meta);
        } else {
          this.addOv(i, { L: x0, T: y0 - (meta.size * this.scale * 0.6), W: w * this.scale, H: h * this.scale }, url, meta);
          this.setTool(null);
        }
      };
      $('#tTxt').focus();
    });
  },

  textPng(m) {
    const K = 4; // دقة الرسم (4 بكسل لكل نقطة)
    const font = `${m.bold ? 'bold ' : ''}${m.size * K}px "${m.font}", "Segoe UI", Tahoma, Arial, sans-serif`;
    const c = document.createElement('canvas'); const g = c.getContext('2d'); g.font = font;
    const lines = m.text.split('\n');
    const lh = m.size * K * 1.25;
    const w = Math.ceil(Math.max(...lines.map(l => g.measureText(l).width), 4)) + K * 2;
    c.width = w; c.height = Math.ceil(lh * lines.length + K * 2);
    const g2 = c.getContext('2d'); g2.font = font; g2.fillStyle = m.color; g2.textBaseline = 'top';
    lines.forEach((l, i) => {
      const rtl = /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(l);
      g2.direction = rtl ? 'rtl' : 'ltr'; g2.textAlign = rtl ? 'right' : 'left';
      g2.fillText(l, rtl ? c.width - K : K, K + i * lh + m.size * K * 0.1);
    });
    return { url: c.toDataURL('image/png'), w: c.width / K, h: c.height / K };
  },

  /* ---------- توقيع ---------- */
  signPad() {
    modal.open(`<h3>ارسم توقيعك</h3><canvas class="sig-pad" id="sig" width="900" height="300"></canvas>
      <div class="row" style="margin-top:10px;align-items:center"><label class="muted">اللون <input type="color" id="sigC" value="#0b2a8a"></label>
      <label class="muted">السماكة <input type="range" id="sigW" min="2" max="12" value="5"></label><span class="spacer"></span><button class="btn sm" id="sigClr">مسح</button></div>
      <div class="actions"><button class="btn primary" id="mOk">استخدام</button><button class="btn" id="mNo">إلغاء</button></div>`, () => {
      const c = $('#sig'), g = c.getContext('2d'); let draw = false, last, any = false;
      const pos = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
      c.onpointerdown = e => { draw = true; last = pos(e); c.setPointerCapture(e.pointerId); };
      c.onpointermove = e => {
        if (!draw) return; const p = pos(e);
        g.strokeStyle = $('#sigC').value; g.lineWidth = +$('#sigW').value; g.lineCap = g.lineJoin = 'round';
        g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke(); last = p; any = true;
      };
      c.onpointerup = () => draw = false;
      $('#sigClr').onclick = () => { g.clearRect(0, 0, c.width, c.height); any = false; };
      $('#mNo').onclick = () => { modal.close(); this.setTool(null); };
      $('#mOk').onclick = () => {
        if (!any) return toast('ارسم التوقيع أولاً');
        // قص الفراغ الزائد
        const d = g.getImageData(0, 0, c.width, c.height).data; let x1 = c.width, y1 = c.height, x2 = 0, y2 = 0;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3]) { x1 = Math.min(x1, x); x2 = Math.max(x2, x); y1 = Math.min(y1, y); y2 = Math.max(y2, y); }
        const t = document.createElement('canvas'); t.width = x2 - x1 + 10; t.height = y2 - y1 + 10;
        t.getContext('2d').drawImage(c, x1 - 5, y1 - 5, t.width, t.height, 0, 0, t.width, t.height);
        this.pendingImg = { url: t.toDataURL('image/png'), w: 160, h: 160 * t.height / t.width, kind: 'sign' };
        modal.close(); toast('اضغط على مكان التوقيع بالصفحة');
      };
    });
  },

  onImage(e) {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return this.setTool(null);
    const rd = new FileReader();
    rd.onload = () => {
      const im = new Image(); im.onload = () => {
        // نحوّل لـ PNG/JPEG حسب النوع
        const w = Math.min(250, im.width), h = w * im.height / im.width;
        this.pendingImg = { url: rd.result, w, h, kind: 'image' };
        toast('اضغط على مكان الصورة بالصفحة');
      }; im.src = rd.result;
    };
    rd.readAsDataURL(f);
  },

  placeImage(i, x, y, pi) {
    this.addOv(i, { L: x, T: y, W: pi.w * this.scale, H: pi.h * this.scale }, pi.url, { kind: pi.kind });
    this.pendingImg = null; this.setTool(null);
  },

  /* ---------- عمليات الصفحات ---------- */
  changed(structural) { if (structural) this.structural = true; Editor.setDirty(true); this.layout(); },
  targets() { return this.picked.size ? this.pages.filter(p => this.picked.has(p)) : [this.pages[this.cur]].filter(Boolean); },

  async op(o) {
    const cur = this.pages[this.cur];
    switch (o) {
      case 'rotL': case 'rotR':
        this.targets().forEach(p => p.extra = (p.extra + (o === 'rotR' ? 90 : -90) + 360) % 360);
        if (Math.max(...this.pages.map(p => this.rot(p) % 180 ? p.h : p.w)) * this.scale > $('#pdfMain').clientWidth - 40) this.fitScale();
        return this.changed(false);
      case 'up': case 'down': {
        const j = this.cur + (o === 'up' ? -1 : 1); if (j < 0 || j >= this.pages.length) return;
        [this.pages[this.cur], this.pages[j]] = [this.pages[j], this.pages[this.cur]]; this.cur = j; return this.changed(true);
      }
      case 'del': {
        const t = this.targets(); if (t.length >= this.pages.length) return toast('لا يمكن حذف كل الصفحات', 'err');
        if (!(await modal.confirm(`حذف ${t.length} صفحة؟`, 'يمكنك التراجع بعدم الحفظ.', 'حذف', true))) return;
        this.pages = this.pages.filter(p => !t.includes(p)); this.picked.clear(); this.cur = Math.min(this.cur, this.pages.length - 1); return this.changed(true);
      }
      case 'blank': {
        const d = await PDFLib.PDFDocument.create(); d.addPage([cur?.w || 595.28, cur?.h || 841.89]);
        const ps = await this.addSource(await d.save()); this.pages.splice(this.cur + 1, 0, ...ps); this.cur++; return this.changed(true);
      }
      case 'insert': return $('#pdfIn').click();
      case 'extract': {
        const t = this.picked.size ? this.pages.filter(p => this.picked.has(p)) : null;
        if (!t) return toast('حدد الصفحات من المربعات ☐ بجانب المصغرات أولاً');
        const base = fmt.base(Editor.path).replace(/\.pdf$/i, '');
        const n = await modal.prompt('اسم الملف الجديد', `${base} - صفحات.pdf`); if (!n) return;
        const bytes = await this.build(t);
        await api.upload(fmt.dir(Editor.path), new File([bytes], n.endsWith('.pdf') ? n : n + '.pdf'));
        return toast(`تم حفظ ${t.length} صفحة في ملف جديد ✔`, 'ok');
      }
      case 'png': {
        const page = await this.jsPage(cur); const vp = page.getViewport({ scale: 2.5, rotation: this.rot(cur) });
        const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        const pg = $(`#pdfMain .pdf-page[data-i="${this.cur}"]`); const g = c.getContext('2d');
        for (const ov of cur.ov) { const r = this.ovRect(pg._vp, ov); const k = 2.5 / this.scale; const im = new Image(); im.src = ov.png; await im.decode(); g.drawImage(im, r.L * k, r.T * k, r.W * k, r.H * k); }
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const name = fmt.base(Editor.path).replace(/\.pdf$/i, '') + ` - صفحة ${this.cur + 1}.png`;
        await api.upload(fmt.dir(Editor.path), new File([blob], name));
        return toast('تم حفظ الصورة: ' + esc(name), 'ok');
      }
      case 'zoomIn': this.scale = Math.min(4, this.scale * 1.2); return this.layout();
      case 'zoomOut': this.scale = Math.max(0.3, this.scale / 1.2); return this.layout();
    }
  },

  async onInsertPdf(e) {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const ps = await this.addSource(new Uint8Array(await f.arrayBuffer()));
      this.pages.splice(this.cur + 1, 0, ...ps); this.cur++; this.changed(true);
      toast(`تمت إضافة ${ps.length} صفحة`, 'ok');
    } catch (er) { toastErr(er); }
  },

  /* ---------- الحفظ ---------- */
  async applyOverlays(doc, page, p) {
    const base = page.getRotation().angle;
    page.setRotation(PDFLib.degrees(((p.baseRot + p.extra) % 360 + 360) % 360));
    void base;
    for (const o of p.ov) {
      const bytes = await (await fetch(o.png)).arrayBuffer();
      const img = o.png.startsWith('data:image/jp') ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
      page.drawImage(img, { x: o.x, y: o.y, width: o.w, height: o.h, rotate: PDFLib.degrees(o.rot) });
    }
  },

  async build(list) {
    const simple = !this.structural && list === this.pages && this.srcs.length >= 1 &&
      this.pages.every((p, i) => p.src === 0 && p.idx === i) && this.pages.length === this.srcs[0].js.numPages;
    if (simple) {
      // تعديل في نفس الملف — يحافظ على الروابط والفهرس والنماذج
      const doc = await PDFLib.PDFDocument.load(this.srcs[0].bytes, { ignoreEncryption: true, updateMetadata: false });
      const pgs = doc.getPages();
      for (let i = 0; i < this.pages.length; i++) await this.applyOverlays(doc, pgs[i], this.pages[i]);
      return doc.save();
    }
    const out = await PDFLib.PDFDocument.create();
    const loaded = {};
    for (const p of list) {
      loaded[p.src] = loaded[p.src] || await PDFLib.PDFDocument.load(this.srcs[p.src].bytes, { ignoreEncryption: true });
      const [cp] = await out.copyPages(loaded[p.src], [p.idx]);
      out.addPage(cp);
      await this.applyOverlays(out, cp, p);
    }
    return out.save();
  },

  async getBlob() {
    const bytes = await this.build(this.pages);
    return new Blob([bytes], { type: 'application/pdf' });
  },
};
