/* home.js — الصفحة الرئيسية + التشغيل */
'use strict';
const Home = {
  renderPrayers() {
    const t = Prayer.today(), now = new Date(), n = Prayer.next(now);
    $('#hPrayers').innerHTML = Prayer.ORDER.map(k => `<div class="${n.key === k && +n.at === +t[k] ? 'next' : (t[k] < now ? 'past' : '')}"><small>${Prayer.NAMES[k]}</small><b>${Prayer.fmtTime(t[k])}</b></div>`).join('');
    $('#hLoc').textContent = '📍 ' + Prayer.cfg.name;
  },
  async renderInfo() {
    try {
      const d = await api.get('/api/info');
      $('#hFiles').textContent = d.files + ' ملف';
      $('#hFilesSize').textContent = fmt.size(d.files_size) + ' في ' + d.root;
      $('#hDisk').textContent = `القرص: ${fmt.size(d.disk_free)} فاضي من ${fmt.size(d.disk_total)}`;
      $('#hDiskBar').style.width = (d.disk_used / d.disk_total * 100).toFixed(1) + '%';
    } catch (e) { $('#hFiles').textContent = '⚠ السيرفر غير متصل'; $('#hFilesSize').textContent = e.message; }
    const r = recent.all();
    $('#hRecent').innerHTML = r.length ? r.slice(0, 7).map(x => `<li data-p="${esc(x.path)}"><span>${iconFor({ ext: x.ext })}</span><span>${esc(x.name)}</span><small class="muted">${new Date(x.t).toLocaleDateString('en-GB')}</small></li>`).join('') : '<li class="muted">لا يوجد بعد — افتح أي ملف من مدير الملفات</li>';
  },
  async renderWeather() {
    try {
      const w = await Weather.get();
      $('#hWxT').textContent = Weather.icon(w.current.weather_code, w.current.is_day) + ' ' + Math.round(w.current.temperature_2m) + '°';
      $('#hWxD').textContent = Weather.desc(w.current.weather_code) + ' · ' + Math.round(w.daily.temperature_2m_max[0]) + '° / ' + Math.round(w.daily.temperature_2m_min[0]) + '° · ' + Prayer.cfg.name;
    } catch { $('#hWxT').textContent = '—'; $('#hWxD').textContent = 'يحتاج إنترنت'; }
  },
  renderQuick() {
    const ids = [...new Set([...store.get('toolFavs', []), ...store.get('toolRecent', []), 'scanner', 'tasbih', 'expenses', 'notes', 'qibla', 'todo'])].slice(0, 8);
    $('#hQuick').innerHTML = ids.map(id => Tools.get(id)).filter(Boolean).map(t => `<a href="#/tool/${t.id}" class="q"><span>${t.icon}</span><small>${esc(t.name)}</small></a>`).join('') + `<a href="#/tools" class="q"><span>➕</span><small>كل الأدوات</small></a>`;
  },
  clock() {
    const now = new Date(), h = now.getHours();
    $('#bigClock').textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    $('#greet').textContent = h < 5 ? 'سهرانين؟ 🌙' : h < 12 ? 'صباح الخير ☀' : h < 17 ? 'نهارك سعيد 🌤' : 'مساء الخير 🌆';
    const d = Prayer.dates(now);
    $('#todayDates').textContent = d.g + (d.h ? ' · ' + d.h : '');
  },
  init() {
    $('#hRecent').onclick = e => { const li = e.target.closest('[data-p]'); if (li) router.nav('#/editor/' + encodeURIComponent(li.dataset.p)); };
    this.clock(); setInterval(() => this.clock(), 10000);
  },
};

Home.init();
Prayer.init();
router.on('home', () => { Home.renderInfo(); Home.renderPrayers(); Home.clock(); Home.renderQuick(); Home.renderWeather(); Radio.syncUI(); });
router.on('prayer', () => { Prayer.renderSettings(); Prayer.refresh(true); });
