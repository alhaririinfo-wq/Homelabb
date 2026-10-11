/* radio.js — راديو عالمي عبر Radio Browser (مجاني، بدون حساب، مفتوح المصدر) */
'use strict';
const Radio = {
  servers: ['https://de1.api.radio-browser.info', 'https://de2.api.radio-browser.info', 'https://fi1.api.radio-browser.info', 'https://all.api.radio-browser.info'],
  server: store.get('radioServer', null),
  current: null, playing: false, list: [], tab: 'fav',
  audio: $('#audio'),
  canHls: !!document.createElement('audio').canPlayType('application/vnd.apple.mpegurl'),

  async q(path) {
    const order = this.server ? [this.server, ...this.servers.filter(s => s !== this.server)] : this.servers;
    let lastErr;
    for (const s of order) {
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
        const r = await fetch(s + path, { signal: ctl.signal }); clearTimeout(t);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        if (this.server !== s) { this.server = s; store.set('radioServer', s); }
        return d;
      } catch (e) { lastErr = e; }
    }
    throw new Error('تعذر الاتصال بخدمة الراديو — تأكد من اتصال الإنترنت (' + (lastErr?.message || '') + ')');
  },

  favs: () => store.get('radioFavs', []),
  recents: () => store.get('radioRecent', []),
  slim: s => ({ stationuuid: s.stationuuid, name: (s.name || '').trim(), url: s.url, url_resolved: s.url_resolved, favicon: s.favicon, country: s.country, countrycode: s.countrycode, tags: s.tags, codec: s.codec, bitrate: s.bitrate, hls: s.hls }),
  isFav(s) { return this.favs().some(f => f.stationuuid === s.stationuuid); },
  toggleFav(s) {
    let f = this.favs();
    f = this.isFav(s) ? f.filter(x => x.stationuuid !== s.stationuuid) : [this.slim(s), ...f];
    store.set('radioFavs', f);
    this.syncUI();
    if (this.tab === 'fav') this.showTab('fav');
    else this.renderList();
  },

  async loadCountries() {
    let c = store.get('radioCountries', null);
    if (!c || Date.now() - c.t > 7 * 864e5) {
      try {
        const d = await this.q('/json/countries?order=stationcount&reverse=true&hidebroken=true');
        c = { t: Date.now(), list: d.filter(x => x.stationcount > 3 && x.iso_3166_1).map(x => [x.iso_3166_1, x.name, x.stationcount]) };
        store.set('radioCountries', c);
      } catch { return; }
    }
    let names; try { names = new Intl.DisplayNames(['ar'], { type: 'region' }); } catch { }
    const opts = c.list.map(([code, name, n]) => [code, (names && names.of(code)) || name, n]).sort((a, b) => a[1].localeCompare(b[1], 'ar'));
    $('#rCountry').innerHTML = '<option value="">كل الدول</option>' + opts.map(([code, name, n]) => `<option value="${code}">${esc(name)} (${n})</option>`).join('');
  },

  async search({ name = '', country = '', tag = '' } = {}) {
    $('#stations').innerHTML = '<div class="empty"><b>📡</b>جاري البحث…</div>';
    $$('#rChips .chip').forEach(c => c.classList.remove('on'));
    this.tab = 'search';
    const sort = $('#rSort').value;
    const p = new URLSearchParams({ limit: '120', hidebroken: 'true', order: sort, reverse: sort === 'name' ? 'false' : 'true' });
    if (name) p.set('name', name);
    if (country) p.set('countrycode', country);
    if (tag) p.set('tag', tag);
    try {
      let d = await this.q('/json/stations/search?' + p);
      if (!this.canHls) d = d.filter(s => !s.hls);
      // صفحة https (نسخة الجوال): المتصفح يمنع البث غير المشفر http
      if (location.protocol === 'https:') d = d.filter(s => (s.url_resolved || s.url || '').startsWith('https:'));
      // إزالة التكرار بالاسم
      const seen = new Set(); this.list = d.filter(s => { const k = (s.name || '').trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
      this.renderList();
    } catch (e) { $('#stations').innerHTML = `<div class="empty"><b>⚠</b>${esc(e.message)}</div>`; }
  },

  showTab(t) {
    this.tab = t;
    this.list = t === 'fav' ? this.favs() : this.recents();
    $$('#rChips .chip').forEach(c => c.classList.toggle('on', c.dataset.tab === t));
    if (!this.list.length) {
      $('#stations').innerHTML = `<div class="empty"><b>${t === 'fav' ? '⭐' : '🕘'}</b>${t === 'fav' ? 'ما عندك مفضلة بعد — دوّر على محطة واضغط ☆' : 'ما سمعت شي بعد'}</div>`;
      return;
    }
    this.renderList();
  },

  renderList() {
    $('#stations').innerHTML = this.list.length ? this.list.map((s, i) => `
      <div class="st${this.current && this.current.stationuuid === s.stationuuid ? ' playing' : ''}" data-i="${i}">
        ${s.favicon ? `<img src="${esc(s.favicon)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=ph>📻</span>'">` : '<span class="ph">📻</span>'}
        <div><b dir="auto">${esc((s.name || '').trim())}</b><small>${esc([s.country, (s.tags || '').split(',').slice(0, 3).join(' · ')].filter(Boolean).join(' — '))}</small>
        <small>${esc([s.codec, s.bitrate ? s.bitrate + 'kbps' : ''].filter(Boolean).join(' '))}</small></div>
        <button class="fav" data-fav title="مفضلة">${this.isFav(s) ? '★' : '☆'}</button>
      </div>`).join('') : '<div class="empty"><b>🔇</b>ما في محطات</div>';
  },

  play(s) {
    this.current = s;
    let urls = [s.url_resolved, s.url].filter((u, i, a) => u && a.indexOf(u) === i);
    if (location.protocol === 'https:') urls = urls.map(u => u.replace(/^http:/, 'https:')).filter((u, i, a) => a.indexOf(u) === i);
    let k = 0;
    const tryNext = () => {
      if (k >= urls.length) { this.setState('تعذر تشغيل المحطة ✖ جرّب غيرها'); this.playing = false; this.syncUI(); return; }
      this.audio.src = urls[k++];
      this.audio.play().catch(err => { if (err.name !== 'AbortError') tryNext(); });
    };
    this.audio.onerror = () => tryNext();
    this.setState('جاري الاتصال…');
    tryNext();
    store.set('radioRecent', [this.slim(s), ...this.recents().filter(x => x.stationuuid !== s.stationuuid)].slice(0, 30));
    store.set('radioLast', this.slim(s));
    // تسجيل نقرة (يساعد ترتيب المحطات في الخدمة)
    this.q('/json/url/' + s.stationuuid).catch(() => { });
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: s.name, artist: s.country || 'Radio', artwork: s.favicon ? [{ src: s.favicon }] : [] });
      navigator.mediaSession.setActionHandler('play', () => this.toggle());
      navigator.mediaSession.setActionHandler('pause', () => this.toggle());
    }
    this.syncUI();
  },

  toggle() {
    if (!this.current) return;
    if (this.audio.paused) {
      if (!this.audio.src) return this.play(this.current);
      // للبث المباشر: نعيد التحميل لنرجع للحظة الحالية
      this.audio.load(); this.audio.play().catch(() => this.play(this.current));
    } else this.audio.pause();
  },

  setState(t) { $('#rnState').textContent = t; $('#mpState').textContent = t; },

  syncUI() {
    const s = this.current;
    $('#rnToggle').disabled = $('#rnFav').disabled = !s;
    $('#miniPlayer').hidden = !s;
    if (s) {
      $('#rnName').textContent = s.name; $('#mpName').textContent = s.name;
      $('#rnMeta').textContent = [s.country, (s.tags || '').split(',').slice(0, 4).join(' · ')].filter(Boolean).join(' — ');
      $('#rnLogo').src = s.favicon || ''; $('#mpLogo').src = s.favicon || '';
      $('#rnLogo').style.visibility = $('#mpLogo').style.visibility = s.favicon ? '' : 'hidden';
      $('#rnFav').textContent = this.isFav(s) ? '★' : '☆';
    }
    const on = this.playing;
    $('#rnToggle').textContent = on ? '⏸' : '▶'; $('#mpToggle').textContent = on ? '⏸' : '▶';
    $('#rnEq').classList.toggle('on', on);
    $$('#stations .st').forEach(el => el.classList.toggle('playing', !!s && this.list[+el.dataset.i]?.stationuuid === s.stationuuid));
    const h = $('#hRadio'); if (h) h.textContent = s ? (on ? '▶ ' : '⏸ ') + s.name : 'ما في شي شغال';
    const hf = $('#hRadioFav'); if (hf) hf.textContent = this.favs().length + ' محطة مفضلة';
  },

  init() {
    const a = this.audio;
    a.volume = store.get('radioVol', 0.8); $('#rnVol').value = a.volume;
    $('#rnVol').oninput = e => { a.volume = +e.target.value; store.set('radioVol', a.volume); };
    a.addEventListener('playing', () => { this.playing = true; this.setState('🔴 بث مباشر'); this.syncUI(); });
    a.addEventListener('pause', () => { this.playing = false; this.setState('متوقف'); this.syncUI(); });
    a.addEventListener('waiting', () => this.setState('تحميل…'));
    $('#rnToggle').onclick = () => this.toggle();
    $('#mpToggle').onclick = () => this.toggle();
    $('#rnFav').onclick = () => this.current && this.toggleFav(this.current);
    $('#stations').onclick = e => {
      const el = e.target.closest('.st'); if (!el) return;
      const s = this.list[+el.dataset.i];
      if (e.target.closest('[data-fav]')) return this.toggleFav(s);
      if (this.current && this.current.stationuuid === s.stationuuid && this.playing) return this.toggle();
      this.play(s);
    };
    $('#rChips').onclick = e => {
      const c = e.target.closest('.chip'); if (!c) return;
      if (c.dataset.tab) return this.showTab(c.dataset.tab);
      $('#rSearch').value = ''; $('#rCountry').value = c.dataset.country || '';
      this.search({ tag: c.dataset.tag || '', country: c.dataset.country || '' }).then(() => c.classList.add('on'));
    };
    const go = () => this.search({ name: $('#rSearch').value.trim(), country: $('#rCountry').value });
    $('#rGo').onclick = go;
    $('#rSearch').onkeydown = e => e.key === 'Enter' && go();
    $('#rCountry').onchange = go;
    const last = store.get('radioLast', null);
    if (last) { this.current = last; this.setState('متوقف — اضغط ▶'); }
    this.syncUI();
  },
};
Radio.init();
let radioInit = false;
router.on('radio', () => { if (!radioInit) { radioInit = true; Radio.loadCountries(); Radio.showTab(Radio.favs().length ? 'fav' : 'fav'); if (!Radio.favs().length) Radio.search({ tag: 'arabic' }); } });
