/* prayer.js — أوقات الصلاة (حساب محلي بالكامل بمكتبة adhan، بدون إنترنت) */
'use strict';
const Prayer = {
  NAMES: { fajr: 'الفجر', sunrise: 'الشروق', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' },
  ORDER: ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'],
  PRESETS: [
    ['هاملن', 52.1037, 9.3561, 'Europe/Berlin'], ['هانوفر', 52.3759, 9.7320, 'Europe/Berlin'], ['برلين', 52.52, 13.405, 'Europe/Berlin'],
    ['هامبورغ', 53.5511, 9.9937, 'Europe/Berlin'], ['دبي', 25.2048, 55.2708, 'Asia/Dubai'], ['دمشق', 33.5138, 36.2765, 'Asia/Damascus'],
    ['حلب', 36.2021, 37.1343, 'Asia/Damascus'], ['مكة المكرمة', 21.4225, 39.8262, 'Asia/Riyadh'], ['المدينة المنورة', 24.4672, 39.6111, 'Asia/Riyadh'],
    ['إسطنبول', 41.0082, 28.9784, 'Europe/Istanbul'], ['القاهرة', 30.0444, 31.2357, 'Africa/Cairo'], ['عمّان', 31.9454, 35.9284, 'Asia/Amman'], ['بيروت', 33.8938, 35.5018, 'Asia/Beirut'],
  ],
  CC_TZ: { de: 'Europe/Berlin', at: 'Europe/Vienna', ch: 'Europe/Zurich', nl: 'Europe/Amsterdam', be: 'Europe/Brussels', fr: 'Europe/Paris', gb: 'Europe/London', dk: 'Europe/Copenhagen', se: 'Europe/Stockholm', no: 'Europe/Oslo', pl: 'Europe/Warsaw', it: 'Europe/Rome', es: 'Europe/Madrid',
    ae: 'Asia/Dubai', sy: 'Asia/Damascus', sa: 'Asia/Riyadh', eg: 'Africa/Cairo', tr: 'Europe/Istanbul', jo: 'Asia/Amman', lb: 'Asia/Beirut', iq: 'Asia/Baghdad', qa: 'Asia/Qatar', kw: 'Asia/Kuwait', bh: 'Asia/Bahrain', om: 'Asia/Muscat', ye: 'Asia/Aden', ps: 'Asia/Hebron', ma: 'Africa/Casablanca', dz: 'Africa/Algiers', tn: 'Africa/Tunis', ly: 'Africa/Tripoli', sd: 'Africa/Khartoum', ir: 'Asia/Tehran', pk: 'Asia/Karachi', us: null, ca: null },

  cfg: Object.assign({ name: 'هاملن', lat: 52.1037, lng: 9.3561, tz: 'Europe/Berlin', method: 'MuslimWorldLeague', madhab: 'Shafi', high: 'auto', notify: false, sound: true, adhan: '', adj: '0,0,0,0,0,0' }, store.get('prayer', {})),
  monthOffset: 0,

  save() { store.set('prayer', this.cfg); this.refresh(true); },

  params() {
    const c = this.cfg;
    const fn = adhan.CalculationMethod[c.method] || adhan.CalculationMethod.MuslimWorldLeague;
    const p = fn();
    p.madhab = c.madhab === 'Hanafi' ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
    const coords = new adhan.Coordinates(+c.lat, +c.lng);
    p.highLatitudeRule = c.high === 'auto' ? adhan.HighLatitudeRule.recommended(coords) : adhan.HighLatitudeRule[c.high];
    const a = String(c.adj || '').split(',').map(x => parseInt(x) || 0);
    ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].forEach((k, i) => p.adjustments[k] = a[i] || 0);
    return { p, coords };
  },

  // تاريخ اليوم في المنطقة الزمنية المختارة (سنة/شهر/يوم)
  ymdInTz(d = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: this.cfg.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-').map(Number);
    return parts; // [y, m, d]
  },

  timesFor(y, m, d) {
    const { p, coords } = this.params();
    const pt = new adhan.PrayerTimes(coords, new Date(y, m - 1, d, 12), p);
    const o = {}; this.ORDER.forEach(k => o[k] = pt[k]); return o;
  },

  today() { const [y, m, d] = this.ymdInTz(); return this.timesFor(y, m, d); },
  tomorrow() { const [y, m, d] = this.ymdInTz(new Date(Date.now() + 864e5)); return this.timesFor(y, m, d); },
  yesterday() { const [y, m, d] = this.ymdInTz(new Date(Date.now() - 864e5)); return this.timesFor(y, m, d); },

  fmtTime(dt) { return dt.toLocaleTimeString('en-GB', { timeZone: this.cfg.tz, hour: '2-digit', minute: '2-digit' }); },

  next(now = new Date()) {
    const t = this.today();
    const prayers = this.ORDER.filter(k => k !== 'sunrise');
    for (const k of this.ORDER) if (t[k] > now) {
      const idx = this.ORDER.indexOf(k);
      const prevK = this.ORDER[idx - 1];
      const prev = prevK ? t[prevK] : this.yesterday().isha;
      return { key: k, at: t[k], prev };
    }
    void prayers;
    return { key: 'fajr', at: this.tomorrow().fajr, prev: t.isha };
  },

  dates(d = new Date()) {
    const g = d.toLocaleDateString('ar', { timeZone: this.cfg.tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'latn' });
    let h = '';
    try { h = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { timeZone: this.cfg.tz, day: 'numeric', month: 'long', year: 'numeric' }).format(d); } catch { }
    return { g, h };
  },

  countdown(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
  },

  /* ---- تنبيه ---- */
  chime() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, ac.currentTime + i * .35); g.gain.linearRampToValueAtTime(.25, ac.currentTime + i * .35 + .05); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + i * .35 + 1.6);
        o.connect(g).connect(ac.destination); o.start(ac.currentTime + i * .35); o.stop(ac.currentTime + i * .35 + 1.7);
      });
    } catch { }
  },
  playAlert() {
    if (!this.cfg.sound) return;
    if (this.cfg.adhan) {
      api.blobUrl(this.cfg.adhan.replace(/^\/+/, '')).then(u => {
        const a = new Audio(u); this.adhanAudio = a;
        return a.play();
      }).catch(() => this.chime());
    } else this.chime();
  },
  alert(k) {
    const msg = `حان الآن وقت صلاة ${this.NAMES[k]}`;
    toast('🕌 ' + msg, 'ok', 15000);
    if (this.cfg.notify && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification('🕌 ' + this.NAMES[k], { body: msg + ' — ' + this.cfg.name, tag: 'prayer' }); } catch { }
    }
    // نخفّض صوت الراديو أثناء الأذان
    if (Radio.playing && this.cfg.adhan) { Radio.audio.pause(); }
    this.playAlert();
  },
  checkAlert(now) {
    if (!this.cfg.notify && !this.cfg.sound) return;
    const t = this.today();
    for (const k of this.ORDER) {
      if (k === 'sunrise') continue;
      const diff = now - t[k];
      if (diff >= 0 && diff < 60000) {
        const key = this.ymdInTz().join('-') + k;
        if (this._last !== key) { this._last = key; if (this.cfg.notify || this.cfg.sound) this.alert(k); }
      }
    }
  },

  /* ---- واجهة ---- */
  renderSettings() {
    const c = this.cfg;
    $('#pLat').value = c.lat; $('#pLng').value = c.lng; $('#pMethod').value = c.method; $('#pMadhab').value = c.madhab;
    $('#pHigh').value = c.high; $('#pNotify').checked = c.notify; $('#pSound').checked = c.sound; $('#pAdhan').value = c.adhan; $('#pAdj').value = c.adj;
    if (!$('#pTz').options.length) {
      let zones = []; try { zones = Intl.supportedValuesOf('timeZone'); } catch { zones = [...new Set(Object.values(this.CC_TZ).filter(Boolean).concat(this.PRESETS.map(p => p[3])))]; }
      $('#pTz').innerHTML = zones.map(z => `<option>${z}</option>`).join('');
    }
    if (![...$('#pTz').options].some(o => o.value === c.tz)) $('#pTz').insertAdjacentHTML('afterbegin', `<option>${esc(c.tz)}</option>`);
    $('#pTz').value = c.tz;
  },

  renderMain() {
    const now = new Date(), t = this.today(), n = this.next(now);
    $('#pLocName').textContent = this.cfg.name;
    $('#pCoords').textContent = `${(+this.cfg.lat).toFixed(3)}, ${(+this.cfg.lng).toFixed(3)} · ${this.cfg.tz}`;
    $('#pList').innerHTML = this.ORDER.map(k => `<li class="${k === n.key && n.at - t[k] === 0 ? 'next' : (t[k] < now ? 'past' : '')}${k === 'sunrise' ? ' sun' : ''}"><span>${this.NAMES[k]}</span><b>${this.fmtTime(t[k])}</b></li>`).join('');
    const { coords } = this.params();
    const q = adhan.Qibla(coords);
    $('#qNeedle').style.transform = `rotate(${q}deg)`;
    $('#qDeg').textContent = `${q.toFixed(1)}° من الشمال باتجاه عقارب الساعة`;
    const d = this.dates(now);
    $('#pDates').textContent = d.g + (d.h ? ' · ' + d.h : '');
  },

  tick() {
    const now = new Date(), n = this.next(now);
    const name = this.NAMES[n.key], left = n.at - now;
    const total = n.at - n.prev, frac = total > 0 ? 1 - left / total : 0;
    $('#pNextName').textContent = name; $('#pCountdown').textContent = this.countdown(left); $('#pNextAt').textContent = 'الساعة ' + this.fmtTime(n.at);
    $('#pRing').style.strokeDashoffset = (326.7 * (1 - frac)).toFixed(1);
    $('#sideNext').innerHTML = `${name} بعد <b>${this.countdown(left)}</b>`;
    $('#hNextName') && ($('#hNextName').textContent = name);
    $('#hNextTime') && ($('#hNextTime').textContent = 'الساعة ' + this.fmtTime(n.at) + ' — ' + this.cfg.name);
    $('#hCountdown') && ($('#hCountdown').textContent = this.countdown(left));
    if (this._lastNext !== n.key) { this._lastNext = n.key; this.renderMain(); Home.renderPrayers && Home.renderPrayers(); }
    this.checkAlert(now);
  },

  renderMonth() {
    const [y0, m0] = this.ymdInTz();
    const dt = new Date(y0, m0 - 1 + this.monthOffset, 1);
    const y = dt.getFullYear(), m = dt.getMonth() + 1;
    const days = new Date(y, m, 0).getDate();
    $('#pMonthLbl').textContent = dt.toLocaleDateString('ar', { month: 'long', year: 'numeric', numberingSystem: 'latn' });
    const today = this.ymdInTz().join('-');
    let h = `<thead><tr><th>اليوم</th><th>هجري</th>${this.ORDER.map(k => `<th>${this.NAMES[k]}</th>`).join('')}</tr></thead><tbody>`;
    let hf; try { hf = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'short' }); } catch { }
    for (let d = 1; d <= days; d++) {
      const t = this.timesFor(y, m, d), date = new Date(y, m - 1, d, 12);
      const wd = date.toLocaleDateString('ar', { weekday: 'short' });
      h += `<tr class="${`${y}-${m}-${d}` === today ? 'today' : ''}${date.getDay() === 5 ? ' fri' : ''}"><td>${wd} ${d}</td><td>${hf ? hf.format(date) : ''}</td>${this.ORDER.map(k => `<td>${this.fmtTime(t[k])}</td>`).join('')}</tr>`;
    }
    $('#pMonth').innerHTML = h + '</tbody>';
  },

  refresh(all) { this.renderMain(); this.tick(); if (all) { this.renderMonth(); Home.renderPrayers && Home.renderPrayers(); } },

  setLocation(name, lat, lng, tz) {
    Object.assign(this.cfg, { name, lat: +(+lat).toFixed(5), lng: +(+lng).toFixed(5) });
    if (tz) this.cfg.tz = tz;
    this.renderSettings(); this.save();
    toast(`📍 تم ضبط الموقع: ${esc(name)}${tz ? '' : ' — تأكد من المنطقة الزمنية'}`, 'ok');
  },

  async citySearch() {
    const q = $('#pCity').value.trim();
    const res = $('#pCityRes');
    const local = this.PRESETS.filter(p => !q || p[0].includes(q));
    const showLocal = () => res.innerHTML = local.map((p, i) => `<button data-preset="${this.PRESETS.indexOf(p)}">📍 ${p[0]}</button>`).join('') || '<div class="muted" style="padding:8px">لا نتائج</div>';
    if (!q) return showLocal();
    res.innerHTML = '<div class="muted" style="padding:8px">جاري البحث…</div>';
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&accept-language=ar&q=${encodeURIComponent(q)}`);
      const d = await r.json();
      this._found = d;
      res.innerHTML = d.length ? d.map((x, i) => `<button data-found="${i}">📍 ${esc(x.display_name)}</button>`).join('') : '<div class="muted" style="padding:8px">لا نتائج</div>';
    } catch { showLocal(); toast('البحث يحتاج إنترنت — هي مدن جاهزة، أو أدخل الإحداثيات يدوياً'); }
  },

  init() {
    this.renderSettings();
    const upd = () => {
      Object.assign(this.cfg, {
        lat: +$('#pLat').value || this.cfg.lat, lng: +$('#pLng').value || this.cfg.lng, method: $('#pMethod').value, madhab: $('#pMadhab').value,
        high: $('#pHigh').value, tz: $('#pTz').value, sound: $('#pSound').checked, adhan: $('#pAdhan').value.trim(), adj: $('#pAdj').value.trim() || '0,0,0,0,0,0',
      });
      this.save();
    };
    ['#pMethod', '#pMadhab', '#pHigh', '#pTz', '#pSound', '#pAdhan', '#pAdj'].forEach(s => $(s).onchange = upd);
    ['#pLat', '#pLng'].forEach(s => $(s).onchange = () => { this.cfg.name = 'موقع مخصص'; upd(); });
    $('#pNotify').onchange = async e => {
      if (e.target.checked && 'Notification' in window && Notification.permission !== 'granted') {
        const p = await Notification.requestPermission();
        if (p !== 'granted') { toast('ما تم السماح بالإشعارات من المتصفح — رح يظهر تنبيه داخل الصفحة فقط'); }
      }
      this.cfg.notify = e.target.checked; this.save();
    };
    $('#pCityGo').onclick = () => this.citySearch();
    $('#pCity').onkeydown = e => e.key === 'Enter' && (e.preventDefault(), this.citySearch());
    $('#pCity').onfocus = () => { if (!$('#pCity').value) this.citySearch(); };
    $('#pCityRes').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.preset) { const p = this.PRESETS[+b.dataset.preset]; this.setLocation(p[0], p[1], p[2], p[3]); }
      else { const x = this._found[+b.dataset.found]; const cc = x.address?.country_code; const nm = x.address?.city || x.address?.town || x.address?.village || x.name || x.display_name.split(',')[0]; this.setLocation(nm, x.lat, x.lon, this.CC_TZ[cc] || null); }
      $('#pCityRes').innerHTML = ''; $('#pCity').value = '';
    };
    document.addEventListener('click', e => { if (!e.target.closest('#pCity,#pCityRes,#pCityGo')) $('#pCityRes').innerHTML = ''; });
    $('#pGeo').onclick = () => {
      if (!navigator.geolocation) return toast('المتصفح لا يدعم تحديد الموقع', 'err');
      toast('جاري تحديد موقعك…');
      navigator.geolocation.getCurrentPosition(
        pos => this.setLocation('موقعي الحالي', pos.coords.latitude, pos.coords.longitude, Intl.DateTimeFormat().resolvedOptions().timeZone),
        err => toast('تعذر تحديد الموقع: ' + esc(err.message) + ' — استخدم البحث أو أدخل الإحداثيات', 'err', 7000),
        { enableHighAccuracy: false, timeout: 15000 });
    };
    $('#pAdhanTest').onclick = () => { if (this.adhanAudio && !this.adhanAudio.paused) { this.adhanAudio.pause(); return; } this.cfg.adhan = $('#pAdhan').value.trim(); const s = this.cfg.sound; this.cfg.sound = true; this.playAlert(); this.cfg.sound = s; };
    $('#pPrevM').onclick = () => { this.monthOffset--; this.renderMonth(); };
    $('#pNextM').onclick = () => { this.monthOffset++; this.renderMonth(); };
    this.renderMain(); this.renderMonth();
    this.tick(); setInterval(() => this.tick(), 1000);
  },
};
