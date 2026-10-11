/* tools-media.js — ماسح المستندات، ضغط الصور، QR، مسجّل الصوت، الكشاف */
'use strict';

const Img = {
  load(file) {
    return new Promise((res, rej) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('صورة غير مدعومة: ' + file.name)); i.src = u; });
  },
  canvas(img, maxDim, rot = 0) {
    let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const k = Math.min(1, maxDim / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
    const c = document.createElement('canvas'); const sw = rot % 180 ? h : w, sh = rot % 180 ? w : h;
    c.width = sw; c.height = sh; const g = c.getContext('2d');
    g.translate(sw / 2, sh / 2); g.rotate(rot * Math.PI / 180); g.drawImage(img, -w / 2, -h / 2, w, h);
    return c;
  },
  // تحسين صورة مستند: رمادي + تباين، أو أبيض وأسود
  enhance(c, mode) {
    if (mode === 'color') return c;
    const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height), p = d.data;
    let min = 255, max = 0; const lum = new Uint8Array(p.length / 4);
    for (let i = 0, j = 0; i < p.length; i += 4, j++) { const l = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; lum[j] = l; }
    const hist = new Uint32Array(256); lum.forEach(l => hist[l]++);
    let acc = 0; const n = lum.length; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.02) { min = i; break; } }
    acc = 0; for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.02) { max = i; break; } }
    const sc = 255 / Math.max(1, max - min);
    for (let i = 0, j = 0; i < p.length; i += 4, j++) {
      let v = Math.max(0, Math.min(255, (lum[j] - min) * sc));
      if (mode === 'bw') v = v > 150 ? 255 : v < 90 ? 0 : (v - 90) * 4.25; else v = Math.min(255, v * 1.08);
      p[i] = p[i + 1] = p[i + 2] = v;
    }
    g.putImageData(d, 0, 0); return c;
  },
  toBlob: (c, type = 'image/jpeg', q = 0.85) => new Promise(r => c.toBlob(r, type, q)),
};

Tools.add({
  id: 'scanner', cat: 'docs', icon: '📷', name: 'ماسح المستندات', desc: 'صوّر أوراقك وحوّلها PDF نظيف', kw: 'scan scanner pdf مسح ورق',
  render(el) {
    let pages = []; // {img, rot}
    el.innerHTML = `<div class="card"><div class="row wrap"><label class="btn primary">📷 صوّر صفحة<input type="file" id="scCam" accept="image/*" capture="environment" hidden></label>
      <label class="btn">🖼 من المعرض<input type="file" id="scGal" accept="image/*" multiple hidden></label>
      <select id="scM"><option value="gray">مستند (رمادي واضح)</option><option value="bw">أبيض وأسود (أوضح نص)</option><option value="color">ألوان</option></select>
      <select id="scQ"><option value="1600">جودة عادية (حجم صغير)</option><option value="2400" selected>جودة عالية</option></select></div>
      <p class="muted">صوّر كل صفحة على خلفية غامقة وبضوء جيد. بتقدر تدوّر أو تحذف أو ترتب الصفحات قبل الحفظ.</p></div>
      <div class="scan-grid" id="scL"></div>
      <div class="row wrap" style="margin-top:12px"><input id="scN" value="مستند ${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}" style="flex:1;min-width:180px"><button class="btn primary" id="scSave" disabled>💾 حفظ PDF</button></div>`;
    const render = async () => {
      $('#scSave').disabled = !pages.length;
      $('#scL').innerHTML = pages.map((p, i) => `<div class="scan-pg" data-i="${i}"><canvas></canvas><div class="row"><b>${i + 1}</b><button class="icon-btn" data-a="rot">⟳</button><button class="icon-btn" data-a="up">▲</button><button class="icon-btn" data-a="del">✕</button></div></div>`).join('') || '<div class="empty"><b>📄</b>لسا ما في صفحات</div>';
      $$('.scan-pg canvas', el).forEach((cv, i) => { const c = Img.enhance(Img.canvas(pages[i].img, 500, pages[i].rot), $('#scM').value); cv.width = c.width; cv.height = c.height; cv.getContext('2d').drawImage(c, 0, 0); });
    };
    const add = async files => { for (const f of files) { try { pages.push({ img: await Img.load(f), rot: 0 }); } catch (e) { toastErr(e); } } render(); };
    $('#scCam').onchange = e => { add([...e.target.files]); e.target.value = ''; };
    $('#scGal').onchange = e => { add([...e.target.files]); e.target.value = ''; };
    $('#scM').onchange = render;
    $('#scL').onclick = e => {
      const a = e.target.closest('[data-a]'); if (!a) return; const i = +a.closest('[data-i]').dataset.i;
      if (a.dataset.a === 'rot') pages[i].rot = (pages[i].rot + 90) % 360;
      if (a.dataset.a === 'del') pages.splice(i, 1);
      if (a.dataset.a === 'up' && i > 0) [pages[i - 1], pages[i]] = [pages[i], pages[i - 1]];
      render();
    };
    $('#scSave').onclick = async () => {
      const b = $('#scSave'); b.disabled = true; b.textContent = '⏳ جاري الإنشاء…';
      try {
        const pdf = await PDFLib.PDFDocument.create(), mode = $('#scM').value, max = +$('#scQ').value;
        for (const p of pages) {
          const c = Img.enhance(Img.canvas(p.img, max, p.rot), mode);
          const jpg = await pdf.embedJpg(await (await Img.toBlob(c, 'image/jpeg', mode === 'bw' ? 0.7 : 0.8)).arrayBuffer());
          const W = 595.28, H = 841.89, s = Math.min(W / c.width, H / c.height);
          const pg = pdf.addPage([W, H]); pg.drawImage(jpg, { x: (W - c.width * s) / 2, y: (H - c.height * s) / 2, width: c.width * s, height: c.height * s });
        }
        const name = ($('#scN').value.trim() || 'مستند').replace(/[\/\\<>:"|?*]/g, '-') + '.pdf';
        const item = await U.saveToFiles('مستندات ممسوحة', new File([await pdf.save()], name, { type: 'application/pdf' }));
        pages = []; render();
        toast(`<a href="#/editor/${encodeURIComponent(item.path)}">افتح الملف ←</a>`, 'ok', 6000);
      } catch (e) { toastErr(e); }
      b.textContent = '💾 حفظ PDF'; b.disabled = !pages.length;
    };
    render();
  },
});

Tools.add({
  id: 'imgtool', cat: 'docs', icon: '🗜', name: 'ضغط وتصغير الصور', desc: 'صغّر حجم الصور للإيميل والمواقع الرسمية', kw: 'compress resize image jpg',
  render(el) {
    let files = [];
    el.innerHTML = `<div class="card"><label class="btn primary">🖼 اختر صور<input type="file" id="itF" accept="image/*" multiple hidden></label>
      <div class="form-grid" style="margin-top:12px"><label>أقصى عرض/طول: <b id="itDv">1600</b>px<input type="range" id="itD" min="400" max="4000" step="100" value="1600"></label>
      <label>الجودة: <b id="itQv">80</b>%<input type="range" id="itQ" min="30" max="100" value="80"></label>
      <label>الصيغة<select id="itT"><option value="image/jpeg">JPG (الأصغر للصور)</option><option value="image/webp">WebP</option><option value="image/png">PNG</option></select></label>
      <label>حجم مستهدف (اختياري) KB<input id="itK" type="number" placeholder="مثال: 500"></label></div></div>
      <div id="itL"></div><div class="row" style="margin-top:12px"><button class="btn primary" id="itS" disabled>💾 حفظ الكل بالملفات</button></div>`;
    const out = [];
    const proc = async () => {
      $('#itDv').textContent = $('#itD').value; $('#itQv').textContent = $('#itQ').value;
      out.length = 0; let h = '';
      for (const f of files) {
        const img = await Img.load(f); let q = +$('#itQ').value / 100, dim = +$('#itD').value, type = $('#itT').value, blob;
        const target = (+$('#itK').value || 0) * 1024;
        for (let i = 0; i < 8; i++) { blob = await Img.toBlob(Img.canvas(img, dim), type, q); if (!target || blob.size <= target) break; if (type !== 'image/png' && q > 0.4) q -= 0.1; else dim = Math.round(dim * 0.8); }
        if (blob.size >= f.size && f.type === type) blob = f; // الأصل أصغر أصلاً
        const ext = type.split('/')[1].replace('jpeg', 'jpg'); const name = f.name.replace(/\.[^.]+$/, '') + '-small.' + ext;
        out.push(new File([blob], name, { type }));
        h += `<div class="card row it-row"><img src="${URL.createObjectURL(blob)}"><div><b>${esc(f.name)}</b><small>${fmt.size(f.size)} ← <b class="pos">${fmt.size(blob.size)}</b> (−${Math.max(0, Math.round((1 - blob.size / f.size) * 100))}%)</small></div></div>`;
      }
      $('#itL').innerHTML = h; $('#itS').disabled = !out.length;
    };
    $('#itF').onchange = e => { files = [...e.target.files]; proc(); };
    let t; el.addEventListener('input', e => { if (e.target.id !== 'itF' && files.length) { clearTimeout(t); t = setTimeout(proc, 300); } });
    $('#itS').onclick = async () => { for (const f of out) await U.saveToFiles('صور مضغوطة', f).catch(toastErr); };
  },
});

Tools.add({
  id: 'qr', cat: 'docs', icon: '🔳', name: 'QR كود', desc: 'اعمل QR أو اقرأ واحد من صورة', kw: 'qr barcode scan',
  render(el) {
    el.innerHTML = `<div class="grid two"><div class="card"><h3>✏ إنشاء</h3>
      <div class="chips" id="qrK"><button class="chip on" data-k="text">نص/رابط</button><button class="chip" data-k="wifi">واي فاي</button><button class="chip" data-k="tel">رقم هاتف</button></div>
      <div id="qrIn"></div><div class="center"><div class="qr-out"><img id="qrImg" alt=""></div></div><div class="row center-row"><button class="btn" id="qrSave">💾 حفظ كصورة</button></div></div>
      <div class="card"><h3>📷 قراءة</h3><label class="btn primary">📷 صوّر أو اختر صورة فيها QR<input type="file" id="qrScan" accept="image/*" capture="environment" hidden></label>
      <div class="res" id="qrRes"><p class="muted">النتيجة بتطلع هون</p></div></div></div>`;
    const forms = {
      text: `<textarea id="qT" rows="3" style="width:100%" placeholder="اكتب نص أو رابط">https://</textarea>`,
      wifi: `<div class="form-grid"><label>اسم الشبكة<input id="qS"></label><label>كلمة السر<input id="qP"></label><label>الحماية<select id="qE"><option>WPA</option><option>WEP</option><option value="nopass">بدون</option></select></label></div>`,
      tel: `<input id="qN" type="tel" placeholder="+49 …" style="width:100%">`,
    };
    let kind = 'text';
    const data = () => kind === 'text' ? $('#qT').value : kind === 'wifi' ? `WIFI:T:${$('#qE').value};S:${$('#qS').value.replace(/([\\;,:"])/g, '\\$1')};P:${$('#qP').value.replace(/([\\;,:"])/g, '\\$1')};;` : 'tel:' + $('#qN').value.replace(/\s/g, '');
    const gen = () => { const d = data(); if (!d) return; try { const q = qrcode(0, 'M'); q.addData(unescape(encodeURIComponent(d))); q.make(); $('#qrImg').src = q.createDataURL(8, 3); } catch { toast('النص طويل كتير', 'err'); } };
    const setK = k => { kind = k; $('#qrIn').innerHTML = forms[k]; $$('#qrK .chip').forEach(c => c.classList.toggle('on', c.dataset.k === k)); gen(); };
    $('#qrK').onclick = e => { const c = e.target.closest('[data-k]'); if (c) setK(c.dataset.k); };
    $('#qrIn').addEventListener('input', gen);
    $('#qrSave').onclick = async () => { const b = await (await fetch($('#qrImg').src)).blob(); U.saveToFiles('QR', new File([b], 'qr-' + Date.now() + '.png', { type: 'image/png' })).catch(toastErr); };
    $('#qrScan').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      $('#qrRes').innerHTML = '<p class="muted">جاري القراءة…</p>';
      try {
        const img = await Img.load(f); let txt = null;
        if ('BarcodeDetector' in window) { try { const r = await new BarcodeDetector({ formats: ['qr_code'] }).detect(img); if (r[0]) txt = r[0].rawValue; } catch { } }
        if (!txt) for (const dim of [1200, 800, 1800]) { const c = Img.canvas(img, dim); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height); const r = jsQR(d.data, c.width, c.height); if (r) { try { txt = decodeURIComponent(escape(r.data)); } catch { txt = r.data; } break; } }
        if (!txt) throw new Error('ما لقيت QR بالصورة — قرّب الكاميرا وخلّي الكود واضح');
        const isUrl = /^https?:\/\//i.test(txt);
        $('#qrRes').innerHTML = `<p dir="auto" style="word-break:break-all"><b>${esc(txt)}</b></p><div class="row">${isUrl ? `<a class="btn primary" href="${esc(txt)}" target="_blank" rel="noopener">فتح الرابط ↗</a>` : ''}<button class="btn" id="qrCp">نسخ</button></div>${txt.startsWith('WIFI:') ? '<p class="muted">هذا كود واي فاي — كلمة السر ضمن النص فوق</p>' : ''}`;
        $('#qrCp').onclick = () => U.copy(txt);
      } catch (er) { $('#qrRes').innerHTML = `<p class="neg">${esc(er.message)}</p>`; }
    };
    setK('text');
  },
});

Tools.add({
  id: 'recorder', cat: 'docs', icon: '🎙', name: 'مسجّل الصوت', desc: 'سجّل ملاحظة صوتية أو اجتماع', kw: 'record audio voice تسجيل',
  render(el) {
    el.innerHTML = `<div class="card center"><div class="big-num" id="rcT">00:00</div><canvas id="rcV" height="60" style="width:100%;max-width:500px"></canvas>
      <div class="row center-row"><button class="round" id="rcB">🎙</button></div><p class="muted" id="rcM">اضغط لتبدأ التسجيل — التسجيل بينحفظ بمجلد "تسجيلات"</p></div><ul class="lst" id="rcL"></ul>`;
    let rec, stream, chunks = [], t0, iv, raf, ac;
    const stop = () => { clearInterval(iv); cancelAnimationFrame(raf); try { stream && stream.getTracks().forEach(t => t.stop()); } catch { } try { ac && ac.close(); } catch { } stream = null; };
    const listRecent = async () => {
      try { const d = await api.list('تسجيلات'); $('#rcL').innerHTML = d.items.filter(i => !i.dir).sort((a, b) => b.mtime - a.mtime).slice(0, 10).map(i => `<li><a href="#/editor/${encodeURIComponent(i.path)}">🎵 ${esc(i.name)}</a><small>${fmt.size(i.size)}</small></li>`).join(''); } catch { }
    };
    $('#rcB').onclick = async () => {
      if (rec && rec.state === 'recording') { rec.stop(); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch { $('#rcM').textContent = 'ما في سماح للمايكروفون (لازم الصفحة تكون https أو على اللابتوب نفسه)'; return; }
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {}); chunks = [];
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stop(); $('#rcB').textContent = '🎙'; $('#rcB').classList.remove('rec');
        const type = rec.mimeType || 'audio/webm', ext = type.includes('mp4') ? 'm4a' : 'webm';
        const name = 'تسجيل ' + new Date().toLocaleString('en-GB').replace(/[\/:]/g, '-').replace(', ', ' ') + '.' + ext;
        await U.saveToFiles('تسجيلات', new File(chunks, name, { type })).catch(toastErr);
        $('#rcM').textContent = 'انحفظ ✔ — اضغط لتسجيل جديد'; listRecent();
      };
      rec.start(1000); t0 = Date.now(); $('#rcB').textContent = '⏹'; $('#rcB').classList.add('rec'); $('#rcM').textContent = 'جاري التسجيل… اضغط ⏹ للإيقاف والحفظ';
      iv = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); $('#rcT').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }, 250);
      try { // موجة الصوت
        ac = new AudioContext(); const an = ac.createAnalyser(); ac.createMediaStreamSource(stream).connect(an); an.fftSize = 256;
        const cv = $('#rcV'), g = cv.getContext('2d'), buf = new Uint8Array(an.frequencyBinCount); cv.width = cv.clientWidth;
        const col = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#8b6cff';
        const draw = () => { an.getByteFrequencyData(buf); g.clearRect(0, 0, cv.width, 60); g.fillStyle = col; const w = cv.width / buf.length; buf.forEach((v, i) => g.fillRect(i * w, 60 - v / 4.3, w - 1, v / 4.3)); raf = requestAnimationFrame(draw); };
        draw();
      } catch { }
    };
    listRecent();
    return () => { if (rec && rec.state === 'recording') rec.stop(); stop(); };
  },
});

Tools.add({
  id: 'torch', cat: 'util', icon: '🔦', name: 'الكشاف', desc: 'ضوء الكاميرا أو شاشة بيضاء', kw: 'flashlight torch ضوء',
  render(el) {
    el.innerHTML = `<div class="card center"><button class="round big" id="trB">🔦</button><p class="muted" id="trM">اضغط لتشغيل ضوء الكاميرا</p><button class="btn" id="trS">⬜ شاشة بيضاء بدلاً منه</button></div><div class="white-screen" id="trW" hidden>اضغط للإغلاق</div>`;
    let stream, track, on = false;
    const off = () => { try { track && track.applyConstraints({ advanced: [{ torch: false }] }); } catch { } try { stream && stream.getTracks().forEach(t => t.stop()); } catch { } stream = track = null; on = false; };
    $('#trB').onclick = async () => {
      if (on) { off(); $('#trB').classList.remove('rec'); $('#trM').textContent = 'انطفى'; return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (!caps.torch) throw new Error('هالجهاز/المتصفح ما بيسمح بالتحكم بالفلاش — استخدم الشاشة البيضاء');
        await track.applyConstraints({ advanced: [{ torch: true }] }); on = true; $('#trB').classList.add('rec'); $('#trM').textContent = 'شغّال 💡';
      } catch (e) { off(); $('#trM').textContent = e.message && e.message.includes('فلاش') ? e.message : 'ما في سماح للكاميرا (يحتاج https وجوال أندرويد)'; }
    };
    $('#trS').onclick = async () => { $('#trW').hidden = false; try { await document.documentElement.requestFullscreen(); } catch { } };
    $('#trW').onclick = () => { $('#trW').hidden = true; try { document.fullscreenElement && document.exitFullscreen(); } catch { } };
    return off;
  },
});
