/* settings.js — الإعدادات: نسخ احتياطي/استرجاع، المظهر، التخزين، الوصول من الجوال */
'use strict';
const Settings = {
  SKIP: ['hl.fx', 'hl.wx', 'hl.radioCountries', 'hl.radioServer'],
  ACCENTS: { '#8b6cff': 'بنفسجي', '#2f9bff': 'أزرق', '#1fb88a': 'أخضر', '#ff8a3d': 'برتقالي', '#ff4d8d': 'وردي', '#c9a227': 'ذهبي' },

  applyTheme() {
    const a = store.get('accent', '#8b6cff');
    document.documentElement.style.setProperty('--accent', a);
    document.documentElement.dataset.theme = store.get('theme', 'dark');
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = store.get('theme', 'dark') === 'light' ? '#f4f2fa' : '#14111f';
  },

  async walk(path, out) {
    const d = await api.list(path);
    for (const it of d.items) { if (it.name === '.trash') continue; if (it.dir) { out.push({ dir: it.path }); await this.walk(it.path, out); } else out.push(it); }
    return out;
  },

  async exportZip(withFiles) {
    const t = toast('⏳ جاري تجهيز النسخة الاحتياطية…', '', 0);
    try {
      const zip = new JSZip();
      const data = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('hl.') && !this.SKIP.includes(k)) data[k] = localStorage.getItem(k); }
      zip.file('homelab-data.json', JSON.stringify({ v: 1, at: new Date().toISOString(), data }, null, 1));
      let n = 0;
      if (withFiles) for (const it of await this.walk('', [])) {
        if (it.dir) zip.folder('files/' + it.dir); else { zip.file('files/' + it.path, await api.blob(it.path)); n++; }
      }
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
      const name = `HomeLab-Backup-${U.today()}.zip`;
      const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 60000);
      toast(`✔ النسخة جاهزة: ${n} ملف + بياناتك (${fmt.size(blob.size)})`, 'ok', 6000);
    } catch (e) { toastErr(e); } finally { t.remove(); }
  },

  async importZip(file) {
    const t = toast('⏳ جاري الاسترجاع…', '', 0);
    try {
      const zip = await JSZip.loadAsync(file);
      let n = 0;
      const dj = zip.file('homelab-data.json');
      if (dj) { const { data } = JSON.parse(await dj.async('string')); Object.entries(data || {}).forEach(([k, v]) => { if (k.startsWith('hl.')) localStorage.setItem(k, v); }); }
      const entries = Object.values(zip.files).filter(f => !f.dir && f.name.startsWith('files/'));
      for (const f of entries) {
        const rel = f.name.slice(6); const blob = await f.async('blob');
        await api.upload('', new File([blob], fmt.base(rel)), rel.includes('/') ? rel : '', null, true); n++;
        t.innerHTML = `⏳ جاري الاسترجاع… ${n}/${entries.length}`;
      }
      toast(`✔ تم الاسترجاع: ${n} ملف${dj ? ' + الملاحظات والمصاريف والإعدادات' : ''}`, 'ok', 5000);
      setTimeout(() => location.reload(), 1500);
    } catch (e) { toastErr(new Error('ملف النسخة غير صالح: ' + e.message)); } finally { t.remove(); }
  },

  async render() {
    const el = $('#settingsBody');
    const local = !!window.HL_LOCAL;
    let est = {}; try { est = await navigator.storage.estimate(); } catch { }
    let persisted = false; try { persisted = await navigator.storage.persisted(); } catch { }
    const acc = store.get('accent', '#8b6cff');
    el.innerHTML = `
      ${local ? `<div class="card"><h3>📱 نسخة الجوال</h3><p class="muted">كل ملفاتك وبياناتك محفوظة داخل جوالك فقط، وما بتنرفع لأي مكان. الصفحة بتشتغل بدون إنترنت بعد أول فتح (ما عدا الراديو والطقس والعملات).</p>
        <p>المساحة المستخدمة: <b>${fmt.size(est.usage || 0)}</b> من <b>${fmt.size(est.quota || 0)}</b> · ${persisted ? '🔒 التخزين محمي من المسح التلقائي' : '⚠ التخزين غير محمي — أضف الصفحة للشاشة الرئيسية لحمايته'}</p>
        <p class="muted">💡 للتثبيت كتطبيق: قائمة المتصفح ⋮ ← <b>تثبيت التطبيق / إضافة إلى الشاشة الرئيسية</b>. على آيفون: زر المشاركة ← <b>إضافة إلى الشاشة الرئيسية</b>.</p></div>`
        : `<div class="card"><h3>📱 الوصول من الجوال على واي فاي البيت</h3><p class="muted">امسح كود QR من الجوال وبتفتح نفس الصفحة مع ملفات اللابتوب.</p><button class="btn primary" id="stPhone">إظهار كود QR والرمز</button></div>`}
      <div class="card"><h3>💾 النسخ الاحتياطي ونقل البيانات</h3>
        <p class="muted">بتطلع ملف ZIP فيه ملفاتك + الملاحظات والمهام والمصاريف والمفضلة وإعدادات الصلاة. بتقدر تستورده على الكمبيوتر أو جوال تاني — هيك بتنقل بين النسختين.</p>
        <div class="row wrap"><button class="btn primary" id="stExp">⬇ نسخة كاملة (ملفات + بيانات)</button><button class="btn" id="stExpD">⬇ البيانات فقط (صغيرة)</button>
        <label class="btn">⬆ استرجاع من نسخة<input type="file" id="stImp" accept=".zip,application/zip" hidden></label></div>
        <p class="muted" style="font-size:12px">آخر نسخة: ${store.get('lastBackup', 'أبداً')}</p></div>
      <div class="card"><h3>🎨 المظهر</h3><div class="row wrap" style="align-items:center">
        <button class="btn ${store.get('theme', 'dark') === 'dark' ? 'active' : ''}" data-theme="dark">🌙 داكن</button><button class="btn ${store.get('theme', 'dark') === 'light' ? 'active' : ''}" data-theme="light">☀ فاتح</button>
        <span class="spacer"></span>${Object.entries(this.ACCENTS).map(([c, n]) => `<button class="swatch ${c === acc ? 'on' : ''}" data-acc="${c}" title="${n}" style="background:${c}"></button>`).join('')}</div></div>
      <div class="card"><h3>🧹 تنظيف</h3><div class="row wrap"><button class="btn" id="stTrash">إفراغ سلة المحذوفات</button><button class="btn" id="stCache">مسح الذاكرة المؤقتة (طقس، عملات)</button></div></div>
      <div class="card"><h3>ℹ عن HomeLab</h3><p class="muted">الإصدار 2.0 · ${local ? 'نسخة الجوال (بدون سيرفر)' : 'نسخة الكمبيوتر'} · ${Tools.list.length} أداة · كل الحسابات على جهازك، بدون حسابات ولا إعلانات.</p></div>`;
    if ($('#stPhone')) $('#stPhone').onclick = () => Phone.open();
    $('#stExp').onclick = () => { store.set('lastBackup', new Date().toLocaleString('en-GB')); this.exportZip(true); };
    $('#stExpD').onclick = () => this.exportZip(false);
    $('#stImp').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      if (await modal.confirm('استرجاع النسخة الاحتياطية؟', 'الملفات بنفس الاسم رح تنستبدل، والملاحظات والمصاريف رح تاخد قيم النسخة.', 'استرجاع')) this.importZip(f);
    };
    el.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => { store.set('theme', b.dataset.theme); this.applyTheme(); this.render(); });
    el.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => { store.set('accent', b.dataset.acc); this.applyTheme(); this.render(); });
    $('#stTrash').onclick = async () => {
      if (!(await modal.confirm('إفراغ السلة؟', 'كل المحذوفات والنسخ السابقة رح تنحذف نهائياً.', 'إفراغ', true))) return;
      try {
        if (window.HL_LOCAL) { const d = await api.list('.trash', true); await api.post('/api/delete', { paths: d.items.map(i => i.path), permanent: true }); }
        else await api.post('/api/empty-trash', {});
        toast('تم إفراغ السلة', 'ok');
      } catch (e) { toastErr(e); }
    };
    $('#stCache').onclick = () => { this.SKIP.forEach(k => localStorage.removeItem(k)); toast('تم المسح', 'ok'); };
  },
};
Settings.applyTheme();
router.on('settings', () => Settings.render());
