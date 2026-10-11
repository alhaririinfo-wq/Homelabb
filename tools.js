/* tools.js — صندوق الأدوات: إطار العمل + أدوات الإنتاجية والمال والأدوات العامة */
'use strict';
const Tools = {
  list: [],
  CATS: { islam: '🕌 إسلامي', work: '✅ إنتاجية', money: '💶 مال', docs: '📷 مستندات وصور', util: '🧰 أدوات', info: '🌤 معلومات' },
  cleanup: null,
  add(t) { this.list.push(t); },
  get(id) { return this.list.find(t => t.id === id); },

  renderGrid() {
    const q = ($('#toolSearch')?.value || '').trim();
    const favs = store.get('toolFavs', []);
    const match = t => !q || (t.name + ' ' + (t.desc || '') + ' ' + (t.kw || '')).includes(q);
    let h = '';
    const favList = this.list.filter(t => favs.includes(t.id) && match(t));
    if (favList.length) h += `<h3 class="cat-h">⭐ المفضلة</h3><div class="tool-grid">${favList.map(t => this.card(t, favs)).join('')}</div>`;
    for (const [c, label] of Object.entries(this.CATS)) {
      const ts = this.list.filter(t => t.cat === c && match(t));
      if (ts.length) h += `<h3 class="cat-h">${label}</h3><div class="tool-grid">${ts.map(t => this.card(t, favs)).join('')}</div>`;
    }
    $('#toolsGrid').innerHTML = h || '<div class="empty"><b>🔍</b>ما في أداة بهالاسم</div>';
  },
  card(t, favs) {
    return `<a class="tool-card" href="#/tool/${t.id}"><span class="ti">${t.icon}</span><b>${esc(t.name)}</b><small>${esc(t.desc || '')}</small>
      <button class="tfav" data-fav="${t.id}" title="مفضلة">${favs.includes(t.id) ? '★' : '☆'}</button></a>`;
  },

  open(id) {
    this.close();
    const t = this.get(id);
    if (!t) return router.nav('#/tools');
    $('#toolTitle').textContent = t.icon + ' ' + t.name;
    // عنصر جديد لكل أداة حتى ما تتراكم المستمعات من أداة لأداة
    const oldB = $('#toolBody'), body = oldB.cloneNode(false); oldB.replaceWith(body);
    store.set('toolRecent', [id, ...store.get('toolRecent', []).filter(x => x !== id)].slice(0, 6));
    try { this.cleanup = t.render(body) || null; } catch (e) { console.error(e); body.innerHTML = `<div class="empty"><b>⚠</b>${esc(e.message)}</div>`; }
  },
  close() { if (typeof this.cleanup === 'function') { try { this.cleanup(); } catch { } } this.cleanup = null; },

  init() {
    $('#toolsGrid').addEventListener('click', e => {
      const b = e.target.closest('[data-fav]'); if (!b) return;
      e.preventDefault();
      let f = store.get('toolFavs', []); f = f.includes(b.dataset.fav) ? f.filter(x => x !== b.dataset.fav) : [...f, b.dataset.fav];
      store.set('toolFavs', f); this.renderGrid();
    });
    $('#toolSearch').oninput = () => this.renderGrid();
    $('#toolBack').onclick = () => router.nav('#/tools');
  },
};

/* أدوات مساعدة مشتركة */
const U = {
  num: (n, d = 2) => (Number.isFinite(n) ? n : 0).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: d }),
  money: (n, c = 'EUR') => { try { return (Number.isFinite(n) ? n : 0).toLocaleString('de-DE', { style: 'currency', currency: c }); } catch { return U.num(n) + ' ' + c; } },
  id: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  today: () => new Date().toISOString().slice(0, 10),
  copy(text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('تم النسخ ✔', 'ok', 1500)).catch(() => {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); toast('تم النسخ ✔', 'ok', 1500); } catch { toast('انسخ يدوياً'); } t.remove();
    });
  },
  vibrate: ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch { } },
  async saveToFiles(folder, file) {
    const r = await api.upload(folder, file);
    toast(`انحفظ بالملفات: <b>${esc(r.item.path)}</b>`, 'ok', 5000);
    return r.item;
  },
  beep(freq = 880, dur = 0.25, times = 3) {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      for (let i = 0; i < times; i++) {
        const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = freq;
        const t0 = ac.currentTime + i * (dur + 0.12);
        g.gain.setValueAtTime(0.3, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + dur);
      }
    } catch { }
  },
  bars(el, data, fmtv = v => U.num(v)) { // مخطط أعمدة أفقي بسيط
    const max = Math.max(1, ...data.map(d => d[1]));
    el.innerHTML = data.length ? data.map(([k, v]) => `<div class="hbar"><span>${esc(k)}</span><div><i style="width:${(v / max * 100).toFixed(1)}%"></i></div><b>${fmtv(v)}</b></div>`).join('') : '<p class="muted">لا يوجد بيانات بعد</p>';
  },
};

/* ===================== إنتاجية ===================== */
Tools.add({
  id: 'notes', cat: 'work', icon: '📝', name: 'ملاحظات', desc: 'ملاحظات سريعة مع بحث وتثبيت', kw: 'notes ملاحظة',
  render(el) {
    let notes = store.get('notes', []), cur = null;
    el.innerHTML = `<div class="split">
      <div class="side"><div class="row"><input id="nQ" type="search" placeholder="بحث…"><button class="btn primary" id="nNew">+ جديدة</button></div><ul class="lst" id="nList"></ul></div>
      <div class="main"><div id="nEd" class="card"><p class="muted">اختر ملاحظة أو أنشئ واحدة جديدة</p></div></div></div>`;
    const save = () => store.set('notes', notes);
    const list = () => {
      const q = $('#nQ').value.trim();
      const ns = notes.filter(n => !q || (n.title + n.body).includes(q)).sort((a, b) => (b.pin - a.pin) || (b.t - a.t));
      $('#nList').innerHTML = ns.map(n => `<li data-id="${n.id}" class="${cur && cur.id === n.id ? 'on' : ''}"><b>${n.pin ? '📌 ' : ''}${esc(n.title || 'بدون عنوان')}</b><small>${esc(n.body.slice(0, 60))}</small><small>${new Date(n.t).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</small></li>`).join('') || '<li class="muted">لا توجد ملاحظات</li>';
    };
    const edit = n => {
      cur = n; list();
      $('#nEd').innerHTML = `<input id="nT" placeholder="العنوان" value="${esc(n.title)}" style="width:100%;font-size:18px;font-weight:600">
        <textarea id="nB" rows="14" dir="auto" style="width:100%;margin-top:8px" placeholder="اكتب هنا…">${esc(n.body)}</textarea>
        <div class="row" style="margin-top:8px"><button class="btn" id="nPin">${n.pin ? 'إلغاء التثبيت' : '📌 تثبيت'}</button><button class="btn" id="nCopy">نسخ</button><button class="btn" id="nFile">حفظ كملف</button><span class="spacer"></span><button class="btn danger" id="nDel">حذف</button></div>`;
      const upd = () => { n.title = $('#nT').value; n.body = $('#nB').value; n.t = Date.now(); save(); list(); };
      $('#nT').oninput = upd; $('#nB').oninput = upd;
      $('#nPin').onclick = () => { n.pin = !n.pin; save(); edit(n); };
      $('#nCopy').onclick = () => U.copy(n.title + '\n' + n.body);
      $('#nFile').onclick = () => U.saveToFiles('ملاحظات', new File([n.body], (n.title || 'ملاحظة').replace(/[\/\\<>:"|?*]/g, '') + '.txt')).catch(toastErr);
      $('#nDel').onclick = async () => { if (await modal.confirm('حذف الملاحظة؟', esc(n.title), 'حذف', true)) { notes = notes.filter(x => x !== n); save(); cur = null; $('#nEd').innerHTML = '<p class="muted">انحذفت</p>'; list(); } };
    };
    $('#nNew').onclick = () => { const n = { id: U.id(), title: '', body: '', pin: false, t: Date.now() }; notes.unshift(n); save(); edit(n); $('#nT').focus(); };
    $('#nQ').oninput = list;
    $('#nList').onclick = e => { const li = e.target.closest('[data-id]'); if (li) edit(notes.find(n => n.id === li.dataset.id)); };
    list();
    if (notes[0]) edit(notes.sort((a, b) => (b.pin - a.pin) || (b.t - a.t))[0]);
  },
});

Tools.add({
  id: 'todo', cat: 'work', icon: '✅', name: 'المهام', desc: 'قائمة مهام مع مواعيد وأولوية', kw: 'todo tasks مهمة',
  render(el) {
    let tasks = store.get('tasks', []), filter = 'open';
    el.innerHTML = `<form class="row wrap" id="tF"><input id="tT" placeholder="مهمة جديدة… (مثال: موعد Agentur)" style="flex:2;min-width:180px" required>
      <input id="tD" type="date" style="flex:1;min-width:140px"><select id="tP"><option value="0">عادي</option><option value="1">مهم</option><option value="2">عاجل 🔥</option></select>
      <button class="btn primary">إضافة</button></form>
      <div class="chips" style="margin:12px 0"><button class="chip on" data-f="open">المفتوحة</button><button class="chip" data-f="today">اليوم</button><button class="chip" data-f="late">متأخرة</button><button class="chip" data-f="done">المنجزة</button><button class="chip" data-f="all">الكل</button></div>
      <ul class="tasks" id="tL"></ul><p class="muted" id="tS"></p>`;
    const save = () => store.set('tasks', tasks);
    const today = U.today();
    const render = () => {
      let ts = tasks.slice();
      if (filter === 'open') ts = ts.filter(t => !t.done);
      if (filter === 'done') ts = ts.filter(t => t.done);
      if (filter === 'today') ts = ts.filter(t => !t.done && t.due === today);
      if (filter === 'late') ts = ts.filter(t => !t.done && t.due && t.due < today);
      ts.sort((a, b) => (a.done - b.done) || (b.pri - a.pri) || ((a.due || '9') < (b.due || '9') ? -1 : 1));
      $('#tL').innerHTML = ts.map(t => `<li class="${t.done ? 'done' : ''} p${t.pri}" data-id="${t.id}"><input type="checkbox" ${t.done ? 'checked' : ''}><span dir="auto">${esc(t.text)}</span>
        ${t.due ? `<small class="${!t.done && t.due < today ? 'late' : ''}">${t.due === today ? 'اليوم' : t.due}</small>` : ''}<button class="icon-btn" data-del>✕</button></li>`).join('') || '<li class="muted">ما في مهام هون 🎉</li>';
      const open = tasks.filter(t => !t.done).length;
      $('#tS').textContent = `${open} مفتوحة · ${tasks.length - open} منجزة`;
    };
    $('#tF').onsubmit = e => { e.preventDefault(); tasks.push({ id: U.id(), text: $('#tT').value.trim(), due: $('#tD').value, pri: +$('#tP').value, done: false }); save(); $('#tT').value = ''; render(); };
    el.querySelector('.chips').onclick = e => { const c = e.target.closest('[data-f]'); if (!c) return; filter = c.dataset.f; $$('.chip', el).forEach(x => x.classList.toggle('on', x === c)); render(); };
    $('#tL').onclick = e => {
      const li = e.target.closest('[data-id]'); if (!li) return; const t = tasks.find(x => x.id === li.dataset.id);
      if (e.target.matches('[data-del]')) tasks = tasks.filter(x => x !== t);
      else if (e.target.matches('input')) { t.done = e.target.checked; if (t.done) U.vibrate(30); }
      save(); render();
    };
    render();
  },
});

Tools.add({
  id: 'timer', cat: 'work', icon: '⏱', name: 'مؤقت وساعة إيقاف', desc: 'مؤقت، ساعة إيقاف، وبومودورو', kw: 'timer stopwatch pomodoro',
  render(el) {
    el.innerHTML = `<div class="chips"><button class="chip on" data-m="timer">⏳ مؤقت</button><button class="chip" data-m="sw">⏱ ساعة إيقاف</button><button class="chip" data-m="pomo">🍅 بومودورو</button></div>
      <div class="card center" style="margin-top:12px"><div class="big-num" id="tmD">00:00</div><div id="tmX"></div></div>`;
    let iv, mode, wake;
    const fmtT = ms => { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0'); };
    const keepAwake = async on => { try { if (on && 'wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); else if (wake) { wake.release(); wake = null; } } catch { } };
    const stop = () => { clearInterval(iv); iv = null; keepAwake(false); };
    const modes = {
      timer() {
        let end = 0, left = 5 * 60000, run = false;
        $('#tmX').innerHTML = `<div class="row wrap center-row">${[1, 3, 5, 10, 15, 30, 60].map(m => `<button class="btn sm" data-min="${m}">${m} د</button>`).join('')}</div>
          <div class="row center-row" style="margin-top:10px"><input id="tmMin" type="number" min="0" value="5" style="width:80px"> دقيقة <input id="tmSec" type="number" min="0" max="59" value="0" style="width:70px"> ثانية</div>
          <div class="row center-row" style="margin-top:14px"><button class="btn primary" id="tmGo">▶ ابدأ</button><button class="btn" id="tmReset">إعادة</button></div>`;
        const show = () => $('#tmD').textContent = fmtT(run ? end - Date.now() : left);
        const set = () => { left = ((+$('#tmMin').value || 0) * 60 + (+$('#tmSec').value || 0)) * 1000; run = false; stop(); $('#tmGo').textContent = '▶ ابدأ'; show(); };
        $('#tmX').onclick = e => { const b = e.target.closest('[data-min]'); if (b) { $('#tmMin').value = b.dataset.min; $('#tmSec').value = 0; set(); } };
        $('#tmMin').oninput = set; $('#tmSec').oninput = set;
        $('#tmGo').onclick = () => {
          if (run) { left = end - Date.now(); run = false; stop(); $('#tmGo').textContent = '▶ استمرار'; return; }
          if (left <= 0) return; end = Date.now() + left; run = true; $('#tmGo').textContent = '⏸ إيقاف مؤقت'; keepAwake(true);
          iv = setInterval(() => { show(); if (end - Date.now() <= 0) { stop(); run = false; left = 0; U.beep(880, .3, 5); U.vibrate([300, 150, 300, 150, 300]); toast('⏰ انتهى الوقت!', 'ok', 8000); $('#tmGo').textContent = '▶ ابدأ'; } }, 200);
        };
        $('#tmReset').onclick = set; show();
      },
      sw() {
        let start = 0, acc = 0, run = false, laps = [];
        $('#tmX').innerHTML = `<div class="row center-row" style="margin-top:14px"><button class="btn primary" id="swGo">▶ ابدأ</button><button class="btn" id="swLap">لفة</button><button class="btn" id="swReset">تصفير</button></div><ol class="laps" id="swL"></ol>`;
        const now = () => acc + (run ? Date.now() - start : 0);
        const show = () => { const t = now(); $('#tmD').textContent = fmtT(t).replace(/$/, '.' + String(Math.floor(t % 1000 / 10)).padStart(2, '0')); };
        $('#swGo').onclick = () => { if (run) { acc = now(); run = false; stop(); $('#swGo').textContent = '▶ استمرار'; } else { start = Date.now(); run = true; iv = setInterval(show, 50); $('#swGo').textContent = '⏸ إيقاف'; } };
        $('#swLap').onclick = () => { if (!run) return; laps.unshift(now()); $('#swL').innerHTML = laps.map((l, i) => `<li>لفة ${laps.length - i}: <b>${fmtT(l)}</b></li>`).join(''); };
        $('#swReset').onclick = () => { stop(); run = false; acc = 0; laps = []; $('#swL').innerHTML = ''; $('#swGo').textContent = '▶ ابدأ'; show(); };
        show();
      },
      pomo() {
        let phase = 'work', end = 0, run = false, count = store.get('pomoCount', 0);
        const len = { work: 25, short: 5, long: 15 };
        $('#tmX').innerHTML = `<p id="pmPh" class="muted">جلسة تركيز 25 دقيقة</p><div class="row center-row"><button class="btn primary" id="pmGo">▶ ابدأ</button><button class="btn" id="pmSkip">تخطي</button></div><p class="muted">جلسات اليوم: <b id="pmC">${count}</b></p>`;
        const label = { work: 'تركيز 🎯', short: 'استراحة قصيرة ☕', long: 'استراحة طويلة 🌿' };
        const set = p => { phase = p; run = false; stop(); end = 0; $('#pmPh').textContent = label[p] + ' — ' + len[p] + ' دقيقة'; $('#tmD').textContent = fmtT(len[p] * 60000); $('#pmGo').textContent = '▶ ابدأ'; };
        const next = () => { if (phase === 'work') { count++; store.set('pomoCount', count); $('#pmC').textContent = count; set(count % 4 ? 'short' : 'long'); } else set('work'); };
        $('#pmGo').onclick = () => {
          if (run) { set(phase); return; }
          end = Date.now() + len[phase] * 60000; run = true; keepAwake(true); $('#pmGo').textContent = '⏹ إيقاف';
          iv = setInterval(() => { $('#tmD').textContent = fmtT(end - Date.now()); if (end <= Date.now()) { U.beep(660, .4, 3); U.vibrate([400, 200, 400]); toast(phase === 'work' ? 'خلصت الجلسة — خذ استراحة ☕' : 'رجعنا للشغل 🎯', 'ok', 8000); next(); } }, 250);
        };
        $('#pmSkip').onclick = next; set('work');
      },
    };
    const go = m => { stop(); mode = m; $$('.chip', el).forEach(c => c.classList.toggle('on', c.dataset.m === m)); modes[m](); };
    el.querySelector('.chips').onclick = e => { const c = e.target.closest('[data-m]'); if (c) go(c.dataset.m); };
    go('timer');
    return stop;
  },
});

Tools.add({
  id: 'countdown', cat: 'work', icon: '📅', name: 'عدّاد المناسبات', desc: 'كم باقي على موعد أو مناسبة', kw: 'countdown events مواعيد',
  render(el) {
    let evs = store.get('events', []);
    el.innerHTML = `<form class="row wrap" id="eF"><input id="eN" placeholder="المناسبة (مثال: موعد الجوب سنتر)" required style="flex:2;min-width:180px"><input id="eD" type="date" required style="flex:1;min-width:140px"><button class="btn primary">إضافة</button></form><div class="ev-grid" id="eL"></div>`;
    const render = () => {
      const t0 = new Date(U.today());
      evs.sort((a, b) => a.date < b.date ? -1 : 1);
      $('#eL').innerHTML = evs.map(e => { const d = Math.round((new Date(e.date) - t0) / 864e5); return `<div class="card ev ${d < 0 ? 'past' : d <= 3 ? 'soon' : ''}"><b dir="auto">${esc(e.name)}</b><div class="big-num sm">${Math.abs(d)}</div><small>${d === 0 ? 'اليوم! 🎉' : d > 0 ? 'يوم باقي' : 'يوم مضى'} · ${e.date}</small><button class="icon-btn" data-del="${e.id}">✕</button></div>`; }).join('') || '<p class="muted">أضف أول مناسبة</p>';
    };
    $('#eF').onsubmit = e => { e.preventDefault(); evs.push({ id: U.id(), name: $('#eN').value, date: $('#eD').value }); store.set('events', evs); $('#eN').value = ''; render(); };
    $('#eL').onclick = e => { const b = e.target.closest('[data-del]'); if (b) { evs = evs.filter(x => x.id !== b.dataset.del); store.set('events', evs); render(); } };
    render();
  },
});

/* ===================== مال ===================== */
Tools.add({
  id: 'expenses', cat: 'money', icon: '💶', name: 'المصاريف', desc: 'سجّل مصاريفك وشوف وين بتروح', kw: 'expenses budget ميزانية مصروف',
  render(el) {
    const CATS = ['🛒 أكل وبقالة', '🏠 إيجار وبيت', '⚡ كهرباء وفواتير', '🚗 سيارة وبنزين', '📱 اتصالات', '👶 أولاد', '💊 صحة', '👕 لبس', '🎉 ترفيه', '📦 أخرى'];
    let ex = store.get('expenses', []), month = U.today().slice(0, 7), budget = store.get('budget', 0);
    el.innerHTML = `<form class="row wrap" id="xF"><input id="xA" type="number" step="0.01" min="0" placeholder="المبلغ €" required style="width:120px">
      <select id="xC">${CATS.map(c => `<option>${c}</option>`).join('')}</select><input id="xN" placeholder="ملاحظة (اختياري)" style="flex:1;min-width:140px">
      <input id="xD" type="date" value="${U.today()}" style="width:150px"><label class="row" style="align-items:center;gap:4px"><input type="checkbox" id="xIn"> دخل</label><button class="btn primary">إضافة</button></form>
      <div class="row wrap" style="margin:14px 0;align-items:center"><button class="btn sm" id="xPrev">→</button><b id="xM"></b><button class="btn sm" id="xNext">←</button><span class="spacer"></span>
      <label class="muted">الميزانية الشهرية <input id="xB" type="number" min="0" value="${budget || ''}" placeholder="€" style="width:100px"></label><button class="btn sm" id="xCsv">تصدير Excel</button></div>
      <div class="grid cards"><div class="card stat"><small>المصروف</small><b id="xOut"></b><div class="bar"><div id="xBar"></div></div><small id="xLeft"></small></div><div class="card stat"><small>الدخل</small><b id="xInT"></b></div><div class="card stat"><small>الصافي</small><b id="xNet"></b></div></div>
      <div class="grid two"><div class="card"><h3>حسب الفئة</h3><div id="xCats"></div></div><div class="card"><h3>العمليات</h3><ul class="lst tx" id="xL"></ul></div></div>`;
    const save = () => store.set('expenses', ex);
    const render = () => {
      const d = new Date(month + '-01');
      $('#xM').textContent = d.toLocaleDateString('ar', { month: 'long', year: 'numeric', numberingSystem: 'latn' });
      const m = ex.filter(e => e.date.startsWith(month)).sort((a, b) => a.date < b.date ? 1 : -1);
      const out = m.filter(e => !e.inc).reduce((s, e) => s + e.amt, 0), inc = m.filter(e => e.inc).reduce((s, e) => s + e.amt, 0);
      $('#xOut').textContent = U.money(out); $('#xInT').textContent = U.money(inc); $('#xNet').textContent = U.money(inc - out);
      $('#xNet').style.color = inc - out < 0 ? 'var(--danger)' : 'var(--ok)';
      $('#xBar').style.width = budget ? Math.min(100, out / budget * 100) + '%' : '0';
      $('#xBar').style.background = budget && out > budget ? 'var(--danger)' : '';
      $('#xLeft').textContent = budget ? (out > budget ? `تجاوزت الميزانية بـ ${U.money(out - budget)}` : `باقي ${U.money(budget - out)} من ${U.money(budget)}`) : 'حدد ميزانية شهرية لتتابعها';
      const byCat = {}; m.filter(e => !e.inc).forEach(e => byCat[e.cat] = (byCat[e.cat] || 0) + e.amt);
      U.bars($('#xCats'), Object.entries(byCat).sort((a, b) => b[1] - a[1]), v => U.money(v));
      $('#xL').innerHTML = m.map(e => `<li data-id="${e.id}"><span>${e.inc ? '💰 دخل' : esc(e.cat)}</span><small dir="auto">${esc(e.note || '')} · ${e.date.slice(5)}</small><b class="${e.inc ? 'pos' : 'neg'}">${e.inc ? '+' : '−'}${U.money(e.amt)}</b><button class="icon-btn" data-del>✕</button></li>`).join('') || '<li class="muted">ما في عمليات هالشهر</li>';
    };
    $('#xF').onsubmit = e => { e.preventDefault(); ex.push({ id: U.id(), amt: Math.abs(+$('#xA').value), cat: $('#xC').value, note: $('#xN').value.trim(), date: $('#xD').value || U.today(), inc: $('#xIn').checked }); save(); $('#xA').value = ''; $('#xN').value = ''; month = ($('#xD').value || U.today()).slice(0, 7); render(); $('#xA').focus(); };
    const shift = k => { const d = new Date(month + '-15'); d.setMonth(d.getMonth() + k); month = d.toISOString().slice(0, 7); render(); };
    $('#xPrev').onclick = () => shift(-1); $('#xNext').onclick = () => shift(1);
    $('#xB').onchange = e => { budget = +e.target.value || 0; store.set('budget', budget); render(); };
    $('#xL').onclick = e => { if (!e.target.matches('[data-del]')) return; ex = ex.filter(x => x.id !== e.target.closest('[data-id]').dataset.id); save(); render(); };
    $('#xCsv').onclick = async () => {
      const rows = [['التاريخ', 'النوع', 'الفئة', 'المبلغ', 'ملاحظة'], ...ex.filter(e => e.date.startsWith(month)).map(e => [e.date, e.inc ? 'دخل' : 'مصروف', e.cat, e.inc ? e.amt : -e.amt, e.note])];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), month);
      U.saveToFiles('مصاريف', new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], `مصاريف ${month}.xlsx`)).catch(toastErr);
    };
    render();
  },
});

Tools.add({
  id: 'currency', cat: 'money', icon: '💱', name: 'محوّل العملات', desc: 'يورو، ليرة، درهم، دولار… بأسعار اليوم', kw: 'currency exchange عملة صرف',
  render(el) {
    const CUR = { EUR: 'يورو', USD: 'دولار أمريكي', AED: 'درهم إماراتي', SAR: 'ريال سعودي', TRY: 'ليرة تركية', SYP: 'ليرة سورية (رسمي)', EGP: 'جنيه مصري', JOD: 'دينار أردني', LBP: 'ليرة لبنانية', IQD: 'دينار عراقي', KWD: 'دينار كويتي', QAR: 'ريال قطري', GBP: 'جنيه إسترليني', CHF: 'فرنك سويسري', SEK: 'كرونة سويدية', DKK: 'كرونة دنماركية', PLN: 'زلوتي بولندي', CAD: 'دولار كندي' };
    let rates = store.get('fx', null);
    const s = store.get('fxSel', { a: 1, from: 'EUR', to: 'SYP' });
    const opts = sel => Object.entries(CUR).map(([c, n]) => `<option value="${c}" ${c === sel ? 'selected' : ''}>${c} — ${n}</option>`).join('');
    el.innerHTML = `<div class="card"><div class="fx"><input id="fA" type="number" value="${s.a}" step="any"><select id="fF">${opts(s.from)}</select>
      <button class="btn" id="fSw">⇅</button><select id="fT">${opts(s.to)}</select></div><div class="big-num sm" id="fR" style="margin-top:14px">—</div><small class="muted" id="fI"></small></div>
      <div class="card" style="margin-top:12px"><h3>جدول سريع</h3><div id="fTab"></div></div>`;
    const calc = () => {
      const a = +$('#fA').value || 0, f = $('#fF').value, t = $('#fT').value; store.set('fxSel', { a, from: f, to: t });
      if (!rates) return;
      const r = rates.rates[t] / rates.rates[f];
      $('#fR').textContent = `${U.num(a * r, 4)} ${t}`;
      $('#fI').textContent = `1 ${f} = ${U.num(r, 6)} ${t} · آخر تحديث: ${new Date(rates.t).toLocaleString('en-GB')}${rates.offline ? ' (من الذاكرة — بدون إنترنت)' : ''}`;
      $('#fTab').innerHTML = `<table class="tbl"><tr><th>${f}</th><th>${t}</th></tr>${[1, 5, 10, 20, 50, 100, 500, 1000].map(v => `<tr><td>${v}</td><td>${U.num(v * r, 2)}</td></tr>`).join('')}</table>`;
    };
    const load = async () => {
      if (rates && Date.now() - rates.t < 6 * 3600e3) return calc();
      try {
        const d = await (await fetch('https://open.er-api.com/v6/latest/EUR')).json();
        if (d.result !== 'success') throw 0;
        rates = { t: Date.now(), rates: d.rates }; store.set('fx', rates);
      } catch { if (rates) rates.offline = true; else { $('#fR').textContent = 'يحتاج إنترنت أول مرة'; return; } }
      calc();
    };
    ['#fA', '#fF', '#fT'].forEach(x => $(x).oninput = calc);
    $('#fSw').onclick = () => { const f = $('#fF').value; $('#fF').value = $('#fT').value; $('#fT').value = f; calc(); };
    load();
  },
});

Tools.add({
  id: 'calcs', cat: 'money', icon: '🧾', name: 'حاسبات سريعة', desc: 'ضريبة MwSt، خصم، نسبة، تقسيم حساب، بنزين', kw: 'vat mwst percent discount fuel split ضريبة',
  render(el) {
    el.innerHTML = `<div class="grid two">
      <div class="card"><h3>🇩🇪 ضريبة المبيعات (MwSt)</h3><div class="row wrap"><input id="vA" type="number" step="0.01" placeholder="المبلغ €"><select id="vR"><option value="19">19%</option><option value="7">7% (أكل، كتب)</option></select><select id="vM"><option value="net">صافي ← إجمالي</option><option value="gross">إجمالي ← صافي</option></select></div><div class="res" id="vO"></div></div>
      <div class="card"><h3>🏷 الخصم</h3><div class="row wrap"><input id="dP" type="number" placeholder="السعر"><input id="dD" type="number" placeholder="الخصم %"></div><div class="res" id="dO"></div></div>
      <div class="card"><h3>٪ النسبة المئوية</h3><div class="row wrap"><input id="pX" type="number" placeholder="كم"><span>من</span><input id="pY" type="number" placeholder="المجموع"></div><div class="res" id="pO"></div></div>
      <div class="card"><h3>🍽 تقسيم الحساب</h3><div class="row wrap"><input id="sT" type="number" placeholder="المبلغ"><input id="sN" type="number" value="2" min="1" placeholder="أشخاص"><input id="sTip" type="number" value="0" placeholder="بقشيش %"></div><div class="res" id="sO"></div></div>
      <div class="card"><h3>⛽ تكلفة المشوار</h3><div class="row wrap"><input id="fK" type="number" placeholder="المسافة كم"><input id="fC" type="number" step="0.1" value="${store.get('fuelCons', 7.5)}" placeholder="لتر/100كم"><input id="fP" type="number" step="0.01" value="${store.get('fuelPrice', 1.75)}" placeholder="سعر اللتر €"><label class="row" style="align-items:center;gap:4px"><input type="checkbox" id="fR"> ذهاب وإياب</label></div><div class="res" id="fO"></div></div>
      <div class="card"><h3>💳 قسط / تقسيط</h3><div class="row wrap"><input id="lA" type="number" placeholder="المبلغ"><input id="lR" type="number" step="0.1" placeholder="فائدة سنوية %"><input id="lM" type="number" placeholder="عدد الأشهر"></div><div class="res" id="lO"></div></div>
    </div>`;
    const v = id => parseFloat($(id).value) || 0;
    const calc = () => {
      const a = v('#vA'), r = v('#vR') / 100;
      if (a) { const net = $('#vM').value === 'net' ? a : a / (1 + r), gross = net * (1 + r); $('#vO').innerHTML = `صافي (Netto): <b>${U.money(net)}</b> · ضريبة: <b>${U.money(gross - net)}</b> · إجمالي (Brutto): <b>${U.money(gross)}</b>`; } else $('#vO').textContent = '';
      $('#dO').innerHTML = v('#dP') ? `السعر بعد الخصم: <b>${U.money(v('#dP') * (1 - v('#dD') / 100))}</b> · وفّرت ${U.money(v('#dP') * v('#dD') / 100)}` : '';
      $('#pO').innerHTML = v('#pY') ? `<b>${U.num(v('#pX') / v('#pY') * 100)}%</b> · و ${U.num(v('#pX'))}% من ${U.num(v('#pY'))} = <b>${U.num(v('#pX') * v('#pY') / 100)}</b>` : '';
      const tot = v('#sT') * (1 + v('#sTip') / 100); $('#sO').innerHTML = v('#sT') ? `كل شخص: <b>${U.money(tot / Math.max(1, v('#sN')))}</b> · المجموع مع البقشيش ${U.money(tot)}` : '';
      const km = v('#fK') * ($('#fR').checked ? 2 : 1), lit = km * v('#fC') / 100; store.set('fuelCons', v('#fC')); store.set('fuelPrice', v('#fP'));
      $('#fO').innerHTML = km ? `<b>${U.money(lit * v('#fP'))}</b> · ${U.num(lit, 1)} لتر لـ ${U.num(km)} كم` : '';
      const L = v('#lA'), i = v('#lR') / 1200, n = v('#lM');
      if (L && n) { const p = i ? L * i / (1 - Math.pow(1 + i, -n)) : L / n; $('#lO').innerHTML = `القسط الشهري: <b>${U.money(p)}</b> · المجموع ${U.money(p * n)} · الفوائد ${U.money(p * n - L)}`; } else $('#lO').textContent = '';
    };
    el.addEventListener('input', calc); calc();
  },
});

/* ===================== أدوات ===================== */
Tools.add({
  id: 'calc', cat: 'util', icon: '🧮', name: 'آلة حاسبة', desc: 'حاسبة علمية مع سجل', kw: 'calculator حاسبة',
  render(el) {
    let hist = store.get('calcHist', []);
    const keys = ['C', '(', ')', '⌫', 'sin', 'cos', 'tan', '√', '7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '%', '+', 'π', '^', 'ANS', '='];
    el.innerHTML = `<div class="calc"><input id="cE" dir="ltr" autocomplete="off" placeholder="0"><div class="calc-r" id="cR">&nbsp;</div>
      <div class="calc-k">${keys.map(k => `<button class="${k === '=' ? 'eq' : /[0-9.]/.test(k) ? 'n' : ''}" data-k="${k}">${k}</button>`).join('')}</div></div><ul class="lst" id="cH"></ul>`;
    let ans = 0;
    const ev = s => {
      const e = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, '(Math.PI)').replace(/√\(?/g, 'Math.sqrt(').replace(/\^/g, '**')
        .replace(/(sin|cos|tan)\(/g, (m, f) => `Math.${f}((Math.PI/180)*`).replace(/ANS/g, `(${ans})`).replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
      if (!/^[\d+\-*/().\sMathsqrtincoPI,]*$/.test(e)) throw 0;
      const opens = (e.match(/\(/g) || []).length - (e.match(/\)/g) || []).length;
      const v = Function('"use strict";return (' + e + ')'.repeat(1) + ')'.repeat(Math.max(0, opens)))();
      if (!Number.isFinite(v)) throw 0; return Math.round(v * 1e12) / 1e12;
    };
    const live = () => { try { $('#cR').textContent = $('#cE').value ? '= ' + U.num(ev($('#cE').value), 10) : ' '; } catch { $('#cR').textContent = ' '; } };
    const showH = () => $('#cH').innerHTML = hist.map(h => `<li data-v="${h.r}"><span dir="ltr">${esc(h.e)}</span><b dir="ltr">= ${h.r}</b></li>`).join('');
    const eq = () => { try { const r = ev($('#cE').value); hist.unshift({ e: $('#cE').value, r }); hist = hist.slice(0, 20); store.set('calcHist', hist); ans = r; $('#cE').value = String(r); showH(); live(); } catch { $('#cR').textContent = 'خطأ بالصيغة'; } };
    el.querySelector('.calc-k').onclick = e => {
      const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return; const i = $('#cE');
      if (k === 'C') i.value = ''; else if (k === '⌫') i.value = i.value.slice(0, -1); else if (k === '=') return eq();
      else i.value += ['sin', 'cos', 'tan'].includes(k) ? k + '(' : k === '√' ? '√(' : k;
      live(); U.vibrate(8);
    };
    $('#cE').oninput = live; $('#cE').onkeydown = e => e.key === 'Enter' && eq();
    $('#cH').onclick = e => { const li = e.target.closest('[data-v]'); if (li) { $('#cE').value = li.dataset.v; live(); } };
    showH();
  },
});

Tools.add({
  id: 'units', cat: 'util', icon: '📏', name: 'محوّل الوحدات', desc: 'طول، وزن، حرارة، مساحة، سرعة، بيانات…', kw: 'units convert تحويل',
  render(el) {
    const U2 = {
      'الطول': { 'متر': 1, 'كيلومتر': 1000, 'سنتيمتر': .01, 'ميليمتر': .001, 'ميل': 1609.344, 'ياردة': .9144, 'قدم': .3048, 'إنش': .0254 },
      'الوزن': { 'كيلوغرام': 1, 'غرام': .001, 'طن': 1000, 'رطل (باوند)': .45359237, 'أونصة': .028349523, 'أوقية سورية (200غ)': .2, 'رطل سوري (2.5كغ)': 2.5 },
      'الحرارة': 'temp',
      'المساحة': { 'متر مربع': 1, 'كيلومتر مربع': 1e6, 'هكتار': 1e4, 'دونم': 1000, 'فدان': 4200.83, 'قدم مربع': .09290304 },
      'الحجم': { 'لتر': 1, 'ميليلتر': .001, 'متر مكعب': 1000, 'غالون أمريكي': 3.785411784, 'كوب': .24, 'ملعقة كبيرة': .015 },
      'السرعة': { 'كم/ساعة': 1, 'م/ث': 3.6, 'ميل/ساعة': 1.609344, 'عقدة': 1.852 },
      'البيانات': { 'بايت': 1, 'كيلوبايت': 1024, 'ميغابايت': 1048576, 'غيغابايت': 1073741824, 'تيرابايت': 1099511627776, 'ميغابت': 131072 },
      'الوقت': { 'ثانية': 1, 'دقيقة': 60, 'ساعة': 3600, 'يوم': 86400, 'أسبوع': 604800, 'شهر (30)': 2592000, 'سنة': 31536000 },
      'استهلاك الوقود': 'fuel',
    };
    el.innerHTML = `<div class="chips" id="uC">${Object.keys(U2).map((k, i) => `<button class="chip ${i ? '' : 'on'}" data-c="${k}">${k}</button>`).join('')}</div>
      <div class="card" style="margin-top:12px"><div class="fx"><input id="uA" type="number" value="1" step="any"><select id="uF"></select><button class="btn" id="uS">⇅</button><select id="uT"></select></div><div class="big-num sm" id="uR" style="margin-top:12px"></div></div><div class="card" style="margin-top:12px"><div id="uAll"></div></div>`;
    let cat = 'الطول';
    const T = { 'مئوية °C': [c => c, c => c], 'فهرنهايت °F': [f => (f - 32) * 5 / 9, c => c * 9 / 5 + 32], 'كلفن K': [k => k - 273.15, c => c + 273.15] };
    const FU = { 'لتر/100كم': [x => x, x => x], 'كم/لتر': [x => 100 / x, x => 100 / x], 'ميل/غالون (US)': [x => 235.215 / x, x => 235.215 / x] };
    const units = () => U2[cat] === 'temp' ? T : U2[cat] === 'fuel' ? FU : U2[cat];
    const conv = (a, f, t) => { const u = units(); if (U2[cat] === 'temp' || U2[cat] === 'fuel') return u[t][1](u[f][0](a)); return a * u[f] / u[t]; };
    const fill = () => { const ks = Object.keys(units()); $('#uF').innerHTML = ks.map(k => `<option>${k}</option>`).join(''); $('#uT').innerHTML = ks.map((k, i) => `<option ${i === 1 ? 'selected' : ''}>${k}</option>`).join(''); calc(); };
    const calc = () => {
      const a = +$('#uA').value || 0, f = $('#uF').value, t = $('#uT').value;
      $('#uR').textContent = `${U.num(conv(a, f, t), 6)} ${t}`;
      $('#uAll').innerHTML = `<table class="tbl">${Object.keys(units()).map(k => `<tr><td>${k}</td><td dir="ltr">${U.num(conv(a, f, k), 6)}</td></tr>`).join('')}</table>`;
    };
    $('#uC').onclick = e => { const c = e.target.closest('[data-c]'); if (!c) return; cat = c.dataset.c; $$('#uC .chip').forEach(x => x.classList.toggle('on', x === c)); fill(); };
    ['#uA', '#uF', '#uT'].forEach(x => $(x).oninput = calc);
    $('#uS').onclick = () => { const f = $('#uF').value; $('#uF').value = $('#uT').value; $('#uT').value = f; calc(); };
    fill();
  },
});

Tools.add({
  id: 'password', cat: 'util', icon: '🔐', name: 'مولّد كلمات السر', desc: 'كلمات سر قوية وعشوائية فعلاً', kw: 'password generator',
  render(el) {
    el.innerHTML = `<div class="card"><div class="pw" id="pwO" dir="ltr"></div><div class="row wrap" style="margin-top:12px"><button class="btn primary" id="pwG">🔄 جديد</button><button class="btn" id="pwC">نسخ</button></div>
      <div class="form-grid" style="margin-top:14px"><label>الطول: <b id="pwLv">16</b><input type="range" id="pwL" min="6" max="64" value="16"></label>
      <label class="check"><input type="checkbox" id="pwU" checked> أحرف كبيرة A-Z</label><label class="check"><input type="checkbox" id="pwD" checked> أرقام</label>
      <label class="check"><input type="checkbox" id="pwS" checked> رموز !@#</label><label class="check"><input type="checkbox" id="pwX"> بدون أحرف متشابهة (0/O, l/1)</label>
      <label class="check"><input type="checkbox" id="pwW"> عبارة كلمات (أسهل للحفظ)</label></div><p class="muted" id="pwSt"></p></div>`;
    const W = 'apple river stone cloud tiger green house light music orange paper silver winter yellow forest planet coffee window garden rocket ocean bridge candle dragon falcon harbor island jungle lemon marble needle orbit pepper quartz rabbit saddle tomato violet walnut zebra anchor basket cactus desert ember fabric glacier hammer'.split(' ');
    const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
    const gen = () => {
      const L = +$('#pwL').value; $('#pwLv').textContent = L; let p, bits;
      if ($('#pwW').checked) { const n = Math.max(3, Math.round(L / 5)); p = Array.from({ length: n }, () => W[rnd(W.length)]).join('-') + '-' + rnd(100); bits = n * Math.log2(W.length) + 6.6; }
      else {
        let cs = 'abcdefghijklmnopqrstuvwxyz'; if ($('#pwU').checked) cs += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; if ($('#pwD').checked) cs += '0123456789'; if ($('#pwS').checked) cs += '!@#$%&*?-_=+';
        if ($('#pwX').checked) cs = cs.replace(/[0Ol1I]/g, '');
        p = Array.from({ length: L }, () => cs[rnd(cs.length)]).join(''); bits = L * Math.log2(cs.length);
      }
      $('#pwO').textContent = p;
      $('#pwSt').textContent = `القوة: ${bits < 50 ? '🔴 ضعيفة' : bits < 80 ? '🟡 جيدة' : '🟢 قوية جداً'} (${Math.round(bits)} bit)`;
    };
    el.addEventListener('input', gen); $('#pwG').onclick = gen; $('#pwC').onclick = () => U.copy($('#pwO').textContent); gen();
  },
});

Tools.add({
  id: 'text', cat: 'util', icon: '🔤', name: 'أدوات النص', desc: 'عدّ الكلمات، إزالة التشكيل، تحويل الأرقام', kw: 'text words count tashkeel',
  render(el) {
    el.innerHTML = `<textarea id="txI" rows="8" dir="auto" style="width:100%" placeholder="الصق النص هنا…"></textarea>
      <div class="stats-row" id="txS"></div>
      <div class="row wrap" style="margin-top:10px">
        <button class="btn sm" data-a="tashkeel">إزالة التشكيل</button><button class="btn sm" data-a="toLatin">٠١٢ ← 012</button><button class="btn sm" data-a="toArabic">012 ← ٠١٢</button>
        <button class="btn sm" data-a="upper">ABC</button><button class="btn sm" data-a="lower">abc</button><button class="btn sm" data-a="trim">إزالة الفراغات الزائدة</button>
        <button class="btn sm" data-a="lines">ترتيب الأسطر</button><button class="btn sm" data-a="dedupe">حذف الأسطر المكررة</button><button class="btn sm" data-a="reverse">عكس النص</button>
        <button class="btn sm primary" data-a="copy">نسخ</button></div>`;
    const t = () => $('#txI').value, set = v => { $('#txI').value = v; st(); };
    const st = () => {
      const s = t(); const words = (s.match(/\S+/g) || []).length;
      $('#txS').innerHTML = `<div><b>${words}</b><small>كلمة</small></div><div><b>${s.length}</b><small>حرف</small></div><div><b>${s.replace(/\s/g, '').length}</b><small>بدون فراغات</small></div><div><b>${s ? s.split('\n').length : 0}</b><small>سطر</small></div><div><b>${Math.max(1, Math.round(words / 200))}</b><small>دقيقة قراءة</small></div>`;
    };
    const A = {
      tashkeel: () => set(t().replace(/[ً-ْٰـ]/g, '')),
      toLatin: () => set(t().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))),
      toArabic: () => set(t().replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d])),
      upper: () => set(t().toUpperCase()), lower: () => set(t().toLowerCase()),
      trim: () => set(t().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()),
      lines: () => set(t().split('\n').sort((a, b) => a.localeCompare(b, 'ar')).join('\n')),
      dedupe: () => set([...new Set(t().split('\n'))].join('\n')),
      reverse: () => set([...t()].reverse().join('')),
      copy: () => U.copy(t()),
    };
    el.addEventListener('click', e => { const a = e.target.closest('[data-a]'); if (a) A[a.dataset.a](); });
    $('#txI').oninput = st; st();
  },
});

Tools.add({
  id: 'random', cat: 'util', icon: '🎲', name: 'قرعة وعشوائي', desc: 'نرد، عملة، رقم عشوائي، اختيار اسم', kw: 'random dice coin قرعة',
  render(el) {
    const rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
    el.innerHTML = `<div class="grid two"><div class="card center"><h3>🎲 نرد</h3><div class="big-num" id="rD">🎲</div><button class="btn primary" id="rDb">ارمِ</button></div>
      <div class="card center"><h3>🪙 عملة</h3><div class="big-num sm" id="rC">؟</div><button class="btn primary" id="rCb">اقلب</button></div>
      <div class="card center"><h3>🔢 رقم عشوائي</h3><div class="row center-row"><input id="rA" type="number" value="1" style="width:80px"> — <input id="rB" type="number" value="100" style="width:80px"></div><div class="big-num sm" id="rN">—</div><button class="btn primary" id="rNb">اختر</button></div>
      <div class="card"><h3>👥 اختيار من قائمة</h3><textarea id="rL" rows="5" style="width:100%" placeholder="كل اسم على سطر">${esc(store.get('randList', ''))}</textarea><div class="big-num sm center" id="rP">—</div><button class="btn primary" id="rPb">اختر واحد</button></div></div>`;
    const faces = '⚀⚁⚂⚃⚄⚅';
    $('#rDb').onclick = () => { let i = 0; const iv = setInterval(() => { $('#rD').textContent = faces[rnd(6)]; if (++i > 10) { clearInterval(iv); const v = rnd(6); $('#rD').textContent = faces[v] + ' ' + (v + 1); U.vibrate(40); } }, 60); };
    $('#rCb').onclick = () => { $('#rC').textContent = '…'; setTimeout(() => { $('#rC').textContent = rnd(2) ? 'وجه 👑' : 'كتابة 🔢'; U.vibrate(40); }, 400); };
    $('#rNb').onclick = () => { const a = Math.ceil(+$('#rA').value), b = Math.floor(+$('#rB').value); $('#rN').textContent = b >= a ? a + rnd(b - a + 1) : '—'; };
    $('#rPb').onclick = () => { const l = $('#rL').value.split('\n').map(s => s.trim()).filter(Boolean); store.set('randList', $('#rL').value); $('#rP').textContent = l.length ? l[rnd(l.length)] : 'أضف أسماء'; };
  },
});

Tools.add({
  id: 'level', cat: 'util', icon: '📐', name: 'ميزان الماء', desc: 'ميزان فقاعة بحساس الجوال', kw: 'level bubble ميزان',
  render(el) {
    el.innerHTML = `<div class="card center"><div class="level"><div class="lv-bubble" id="lvB"></div><div class="lv-ring"></div></div><div class="big-num sm" id="lvT">ضع الجوال على سطح</div><button class="btn" id="lvGo">تفعيل الحساس</button><p class="muted" id="lvM"></p></div>`;
    const h = e => {
      const x = Math.max(-45, Math.min(45, e.gamma || 0)), y = Math.max(-45, Math.min(45, e.beta || 0));
      $('#lvB').style.transform = `translate(${-x * 2.2}px, ${-y * 2.2}px)`;
      const flat = Math.abs(x) < 1 && Math.abs(y) < 1;
      $('#lvT').textContent = `${x.toFixed(1)}° · ${y.toFixed(1)}°`; $('#lvB').classList.toggle('ok', flat); if (flat) U.vibrate(5);
    };
    const start = async () => {
      try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) { if (await DeviceOrientationEvent.requestPermission() !== 'granted') throw 0; } } catch { $('#lvM').textContent = 'ما تم السماح بالحساس'; return; }
      window.addEventListener('deviceorientation', h); $('#lvGo').hidden = true;
      setTimeout(() => { if ($('#lvT') && $('#lvT').textContent.includes('سطح')) $('#lvM').textContent = 'ما في حساس حركة بهالجهاز (الأداة للجوال)'; }, 2500);
    };
    $('#lvGo').onclick = start;
    if (!(typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission)) start();
    return () => window.removeEventListener('deviceorientation', h);
  },
});

/* ===================== معلومات ===================== */
Tools.add({
  id: 'weather', cat: 'info', icon: '🌤', name: 'الطقس', desc: 'طقس اليوم و7 أيام لمدينتك', kw: 'weather طقس',
  render(el) {
    el.innerHTML = '<div class="empty"><b>⏳</b>جاري جلب الطقس…</div>';
    Weather.get(true).then(w => {
      const c = w.current, d = w.daily;
      el.innerHTML = `<div class="card wx-now"><div class="wx-ic">${Weather.icon(c.weather_code, c.is_day)}</div><div><div class="big-num">${Math.round(c.temperature_2m)}°</div>
        <b>${Weather.desc(c.weather_code)}</b><p class="muted">📍 ${esc(Prayer.cfg.name)} · يحس كأنه ${Math.round(c.apparent_temperature)}° · رطوبة ${c.relative_humidity_2m}% · رياح ${Math.round(c.wind_speed_10m)} كم/س</p></div></div>
        <div class="wx-days">${d.time.map((t, i) => `<div class="card"><small>${i ? new Date(t).toLocaleDateString('ar', { weekday: 'short' }) : 'اليوم'}</small><div class="wx-ic sm">${Weather.icon(d.weather_code[i], 1)}</div><b>${Math.round(d.temperature_2m_max[i])}°</b><small>${Math.round(d.temperature_2m_min[i])}°</small><small>💧${d.precipitation_probability_max[i] ?? 0}%</small></div>`).join('')}</div>
        <p class="muted">الشروق ${d.sunrise[0].slice(11)} · الغروب ${d.sunset[0].slice(11)} · المصدر: Open-Meteo · الموقع من إعدادات الصلاة</p>`;
    }).catch(e => el.innerHTML = `<div class="empty"><b>📡</b>${esc(e.message)}</div>`);
  },
});

Tools.add({
  id: 'dates', cat: 'info', icon: '🗓', name: 'حاسبة التواريخ', desc: 'العمر، الفرق بين تاريخين، إضافة أيام', kw: 'age date diff عمر',
  render(el) {
    el.innerHTML = `<div class="grid two"><div class="card"><h3>🎂 حساب العمر</h3><input id="aB" type="date" value="${store.get('dob', '')}"><div class="res" id="aO"></div></div>
      <div class="card"><h3>↔ الفرق بين تاريخين</h3><div class="row wrap"><input id="dA" type="date" value="${U.today()}"><input id="dB" type="date"></div><div class="res" id="dO"></div></div>
      <div class="card"><h3>➕ إضافة/طرح أيام</h3><div class="row wrap"><input id="pD" type="date" value="${U.today()}"><input id="pN" type="number" value="30" style="width:90px"><select id="pU"><option value="d">يوم</option><option value="w">أسبوع</option><option value="m">شهر</option></select></div><div class="res" id="pO"></div><small class="muted">مفيد للمهل (Frist) — مثلاً 14 يوم أو شهر من تاريخ الرسالة</small></div></div>`;
    const diff = (a, b) => { let y = b.getFullYear() - a.getFullYear(), m = b.getMonth() - a.getMonth(), d = b.getDate() - a.getDate(); if (d < 0) { m--; d += new Date(b.getFullYear(), b.getMonth(), 0).getDate(); } if (m < 0) { y--; m += 12; } return { y, m, d, days: Math.round((b - a) / 864e5) }; };
    const fd = d => d.toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'latn' });
    const calc = () => {
      if ($('#aB').value) { store.set('dob', $('#aB').value); const b = new Date($('#aB').value), n = new Date(U.today()); const r = diff(b, n); const nb = new Date(n.getFullYear(), b.getMonth(), b.getDate()); if (nb < n) nb.setFullYear(n.getFullYear() + 1); $('#aO').innerHTML = `<b>${r.y}</b> سنة و<b>${r.m}</b> شهر و<b>${r.d}</b> يوم · ${U.num(r.days)} يوم بالمجموع<br>عيد الميلاد الجاي بعد <b>${Math.round((nb - n) / 864e5)}</b> يوم`; }
      if ($('#dA').value && $('#dB').value) { let a = new Date($('#dA').value), b = new Date($('#dB').value); const neg = b < a; if (neg) [a, b] = [b, a]; const r = diff(a, b); let wd = 0; for (let d = new Date(a); d < b; d.setDate(d.getDate() + 1)) if (d.getDay() % 6) wd++; $('#dO').innerHTML = `<b>${U.num(r.days)}</b> يوم (${r.y ? r.y + ' سنة ' : ''}${r.m ? r.m + ' شهر ' : ''}${r.d} يوم) · ${wd} يوم عمل`; }
      if ($('#pD').value) { const d = new Date($('#pD').value), n = +$('#pN').value || 0; if ($('#pU').value === 'm') d.setMonth(d.getMonth() + n); else d.setDate(d.getDate() + n * ($('#pU').value === 'w' ? 7 : 1)); $('#pO').innerHTML = `<b>${fd(d)}</b>`; }
    };
    el.addEventListener('input', calc); calc();
  },
});

/* ===================== الطقس (مشترك مع الرئيسية) ===================== */
const Weather = {
  async get(force) {
    const c = store.get('wx', null), key = Prayer.cfg.lat + ',' + Prayer.cfg.lng;
    if (c && c.key === key && Date.now() - c.t < 30 * 60e3 && !force) return c.data;
    try {
      const u = `https://api.open-meteo.com/v1/forecast?latitude=${Prayer.cfg.lat}&longitude=${Prayer.cfg.lng}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=auto&forecast_days=7`;
      const data = await (await fetch(u)).json();
      if (!data.current) throw 0;
      store.set('wx', { key, t: Date.now(), data }); return data;
    } catch { if (c && c.key === key) return c.data; throw new Error('الطقس يحتاج إنترنت'); }
  },
  icon(code, day = 1) {
    if (code === 0) return day ? '☀️' : '🌙'; if (code <= 2) return day ? '🌤' : '☁️'; if (code === 3) return '☁️'; if (code <= 48) return '🌫';
    if (code <= 57) return '🌦'; if (code <= 67) return '🌧'; if (code <= 77) return '❄️'; if (code <= 82) return '🌧'; if (code <= 86) return '🌨'; return '⛈';
  },
  desc(code) {
    const m = { 0: 'صافي', 1: 'صافي غالباً', 2: 'غائم جزئياً', 3: 'غائم', 45: 'ضباب', 48: 'ضباب', 51: 'رذاذ خفيف', 53: 'رذاذ', 55: 'رذاذ كثيف', 61: 'مطر خفيف', 63: 'مطر', 65: 'مطر غزير', 66: 'مطر متجمد', 67: 'مطر متجمد', 71: 'ثلج خفيف', 73: 'ثلج', 75: 'ثلج كثيف', 77: 'حبيبات ثلج', 80: 'زخات مطر', 81: 'زخات مطر', 82: 'زخات قوية', 85: 'زخات ثلج', 86: 'زخات ثلج', 95: 'عاصفة رعدية', 96: 'عاصفة مع برد', 99: 'عاصفة مع برد' };
    return m[code] || '—';
  },
};
