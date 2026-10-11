/* tools-islamic.js — القبلة، المسبحة، الأذكار، الزكاة، التاريخ الهجري */
'use strict';

Tools.add({
  id: 'qibla', cat: 'islam', icon: '🧭', name: 'بوصلة القبلة', desc: 'بوصلة حيّة بحساس الجوال', kw: 'qibla compass قبلة',
  render(el) {
    const { coords } = Prayer.params();
    const q = adhan.Qibla(coords);
    el.innerHTML = `<div class="card center"><div class="compass-big"><div class="dial" id="qDial"><span class="n">N</span><span class="e">E</span><span class="s">S</span><span class="w">W</span>
      <div class="kaaba" id="qK" style="transform:rotate(${q}deg)"><i>🕋</i></div></div><div class="fixed-arrow">▲</div></div>
      <div class="big-num sm" id="qT">${q.toFixed(1)}°</div><p class="muted">📍 ${esc(Prayer.cfg.name)} — اتجاه القبلة ${q.toFixed(1)}° من الشمال</p>
      <button class="btn primary" id="qGo">تفعيل البوصلة</button><p class="muted" id="qM">حط الجوال مسطّح وبعيد عن المعادن والمغناطيس</p></div>`;
    let got = false;
    const h = e => {
      let hd = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.absolute || e.type === 'deviceorientationabsolute') && e.alpha != null ? 360 - e.alpha : null;
      if (hd == null) return; got = true;
      $('#qDial').style.transform = `rotate(${-hd}deg)`;
      const diff = ((q - hd + 540) % 360) - 180;
      $('#qT').textContent = Math.abs(diff) < 4 ? '✅ أنت باتجاه القبلة' : `${diff > 0 ? 'لف يمين ↻' : 'لف يسار ↺'} ${Math.abs(diff).toFixed(0)}°`;
      if (Math.abs(diff) < 4) U.vibrate(10);
    };
    const start = async () => {
      try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission && await DeviceOrientationEvent.requestPermission() !== 'granted') throw 0; } catch { $('#qM').textContent = 'ما تم السماح بالحساس'; return; }
      window.addEventListener('deviceorientationabsolute', h); window.addEventListener('deviceorientation', h); $('#qGo').hidden = true;
      setTimeout(() => { if (!got && $('#qM')) $('#qM').textContent = 'ما في بوصلة بهالجهاز — استخدم الرقم: ' + q.toFixed(1) + '° من الشمال باتجاه عقارب الساعة'; }, 3000);
    };
    $('#qGo').onclick = start;
    if (!(typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission)) start();
    return () => { window.removeEventListener('deviceorientationabsolute', h); window.removeEventListener('deviceorientation', h); };
  },
});

Tools.add({
  id: 'tasbih', cat: 'islam', icon: '📿', name: 'المسبحة', desc: 'عدّاد تسبيح مع اهتزاز وحفظ', kw: 'tasbih مسبحة تسبيح',
  render(el) {
    const D = ['سبحان الله', 'الحمد لله', 'الله أكبر', 'لا إله إلا الله', 'أستغفر الله', 'سبحان الله وبحمده', 'لا حول ولا قوة إلا بالله', 'اللهم صلِّ على محمد'];
    let st = store.get('tasbih', { i: 0, c: {}, target: 33, total: 0 });
    el.innerHTML = `<div class="chips" id="tbC">${D.map((d, i) => `<button class="chip ${i === st.i ? 'on' : ''}" data-i="${i}">${d}</button>`).join('')}</div>
      <div class="tasbih"><button class="tb-btn" id="tbB"><span id="tbN">0</span><small id="tbD"></small><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="56"/><circle cx="60" cy="60" r="56" id="tbR"/></svg></button></div>
      <div class="row wrap center-row"><label class="muted">الهدف <select id="tbT">${[33, 34, 99, 100, 1000, 0].map(t => `<option value="${t}" ${t === st.target ? 'selected' : ''}>${t || '∞'}</option>`).join('')}</select></label>
      <button class="btn sm" id="tbZ">تصفير</button><span class="muted">مجموع كل الأذكار: <b id="tbTot"></b></span></div>`;
    const save = () => store.set('tasbih', st);
    const show = () => {
      const n = st.c[st.i] || 0; $('#tbN').textContent = n; $('#tbD').textContent = D[st.i]; $('#tbTot').textContent = st.total;
      const f = st.target ? (n % st.target) / st.target : 0; $('#tbR').style.strokeDashoffset = (351.9 * (1 - (st.target && n && n % st.target === 0 ? 1 : f))).toFixed(1);
    };
    const tap = () => {
      st.c[st.i] = (st.c[st.i] || 0) + 1; st.total++; save(); show();
      if (st.target && st.c[st.i] % st.target === 0) { U.vibrate([80, 60, 80]); toast(`✨ أتممت ${st.target} — ${D[st.i]}`, 'ok', 2500); } else U.vibrate(15);
    };
    $('#tbB').onclick = tap;
    const key = e => { if ((e.key === ' ' || e.key === 'Enter') && !e.target.matches('input,select,textarea,button')) { e.preventDefault(); tap(); } };
    document.addEventListener('keydown', key);
    $('#tbC').onclick = e => { const c = e.target.closest('[data-i]'); if (!c) return; st.i = +c.dataset.i; save(); $$('#tbC .chip').forEach(x => x.classList.toggle('on', x === c)); show(); };
    $('#tbT').onchange = e => { st.target = +e.target.value; save(); show(); };
    $('#tbZ').onclick = () => { st.c[st.i] = 0; save(); show(); };
    show();
    return () => document.removeEventListener('keydown', key);
  },
});

const ADHKAR = {
  common: [
    { t: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَن ذَا الَّذِي يَشْفَعُ عِندَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِّنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ', n: 1, s: 'آية الكرسي — البقرة 255' },
    { t: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ۝ قُلْ هُوَ اللَّهُ أَحَدٌ ۝ اللَّهُ الصَّمَدُ ۝ لَمْ يَلِدْ وَلَمْ يُولَدْ ۝ وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ', n: 3, s: 'سورة الإخلاص' },
    { t: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ۝ قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ ۝ مِن شَرِّ مَا خَلَقَ ۝ وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ ۝ وَمِن شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ ۝ وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ', n: 3, s: 'سورة الفلق' },
    { t: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ۝ قُلْ أَعُوذُ بِرَبِّ النَّاسِ ۝ مَلِكِ النَّاسِ ۝ إِلَٰهِ النَّاسِ ۝ مِن شَرِّ الْوَسْوَاسِ الْخَنَّاسِ ۝ الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ ۝ مِنَ الْجِنَّةِ وَالنَّاسِ', n: 3, s: 'سورة الناس' },
  ],
  morning: [
    { t: 'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذَا الْيَوْمِ وَخَيْرَ مَا بَعْدَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذَا الْيَوْمِ وَشَرِّ مَا بَعْدَهُ، رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ', n: 1, s: 'رواه مسلم' },
    { t: 'اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ', n: 1, s: 'رواه الترمذي' },
  ],
  evening: [
    { t: 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذِهِ اللَّيْلَةِ وَخَيْرَ مَا بَعْدَهَا، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذِهِ اللَّيْلَةِ وَشَرِّ مَا بَعْدَهَا، رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ', n: 1, s: 'رواه مسلم' },
    { t: 'اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ', n: 1, s: 'رواه الترمذي' },
    { t: 'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ', n: 3, s: 'رواه مسلم' },
  ],
  both: [
    { t: 'اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي، فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ', n: 1, s: 'سيد الاستغفار — رواه البخاري' },
    { t: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ', n: 3, s: 'رواه أبو داود والترمذي' },
    { t: 'رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ صَلَّى اللَّهُ عَلَيْهِ وَسَلَّمَ نَبِيًّا', n: 3, s: 'رواه أبو داود' },
    { t: 'اللَّهُمَّ عَافِنِي فِي بَدَنِي، اللَّهُمَّ عَافِنِي فِي سَمْعِي، اللَّهُمَّ عَافِنِي فِي بَصَرِي، لَا إِلَهَ إِلَّا أَنْتَ', n: 3, s: 'رواه أبو داود' },
    { t: 'حَسْبِيَ اللَّهُ لَا إِلَهَ إِلَّا هُوَ، عَلَيْهِ تَوَكَّلْتُ، وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ', n: 7, s: 'رواه أبو داود' },
    { t: 'يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ، أَصْلِحْ لِي شَأْنِي كُلَّهُ، وَلَا تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ', n: 1, s: 'رواه الحاكم' },
    { t: 'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ', n: 10, s: 'متفق عليه' },
    { t: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', n: 100, s: 'رواه مسلم' },
    { t: 'أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ', n: 100, s: 'متفق عليه' },
  ],
  prayer: [
    { t: 'أَسْتَغْفِرُ اللَّهَ', n: 3, s: 'رواه مسلم' },
    { t: 'اللَّهُمَّ أَنْتَ السَّلَامُ، وَمِنْكَ السَّلَامُ، تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالْإِكْرَامِ', n: 1, s: 'رواه مسلم' },
    { t: 'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ، اللَّهُمَّ لَا مَانِعَ لِمَا أَعْطَيْتَ، وَلَا مُعْطِيَ لِمَا مَنَعْتَ، وَلَا يَنْفَعُ ذَا الْجَدِّ مِنْكَ الْجَدُّ', n: 1, s: 'متفق عليه' },
    { t: 'سُبْحَانَ اللَّهِ', n: 33, s: '' }, { t: 'الْحَمْدُ لِلَّهِ', n: 33, s: '' }, { t: 'اللَّهُ أَكْبَرُ', n: 33, s: '' },
    { t: 'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ', n: 1, s: 'تمام المئة — رواه مسلم' },
  ],
  sleep: [
    { t: 'بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا', n: 1, s: 'رواه البخاري' },
    { t: 'سُبْحَانَ اللَّهِ (33) · الْحَمْدُ لِلَّهِ (33) · اللَّهُ أَكْبَرُ (34)', n: 1, s: 'متفق عليه' },
  ],
};

Tools.add({
  id: 'adhkar', cat: 'islam', icon: '📖', name: 'الأذكار', desc: 'الصباح، المساء، بعد الصلاة، النوم', kw: 'adhkar azkar أذكار',
  render(el) {
    const h = new Date().getHours();
    const sets = {
      morning: ['☀ الصباح', [...ADHKAR.common.slice(0, 1), ...ADHKAR.morning, ...ADHKAR.common.slice(1), ...ADHKAR.both]],
      evening: ['🌙 المساء', [...ADHKAR.common.slice(0, 1), ...ADHKAR.evening, ...ADHKAR.common.slice(1), ...ADHKAR.both]],
      prayer: ['🕌 بعد الصلاة', [...ADHKAR.prayer, ...ADHKAR.common]],
      sleep: ['😴 النوم', [...ADHKAR.common, ...ADHKAR.sleep]],
    };
    let cur = h >= 4 && h < 14 ? 'morning' : 'evening';
    el.innerHTML = `<div class="chips" id="azC">${Object.entries(sets).map(([k, v]) => `<button class="chip" data-k="${k}">${v[0]}</button>`).join('')}</div>
      <div class="row center-row" style="margin:10px 0"><span class="muted" id="azP"></span><button class="btn sm" id="azR">إعادة</button>
      <button class="btn sm" id="azF">A+</button><button class="btn sm" id="azF2">A−</button></div><div id="azL"></div>`;
    let size = store.get('azSize', 22), cnt = {};
    const render = () => {
      $$('#azC .chip').forEach(c => c.classList.toggle('on', c.dataset.k === cur));
      const items = sets[cur][1];
      $('#azL').innerHTML = items.map((d, i) => { const c = cnt[cur + i] || 0, done = c >= d.n; return `<div class="dhikr ${done ? 'done' : ''}" data-i="${i}">
        <p style="font-size:${size}px">${d.t}</p><div class="dk-foot"><small>${esc(d.s)}</small><button class="dk-c">${done ? '✓' : `${c} / ${d.n}`}</button></div></div>`; }).join('');
      const done = items.filter((d, i) => (cnt[cur + i] || 0) >= d.n).length;
      $('#azP').textContent = `${done} من ${items.length}`;
    };
    $('#azC').onclick = e => { const c = e.target.closest('[data-k]'); if (c) { cur = c.dataset.k; render(); } };
    $('#azL').onclick = e => {
      const d = e.target.closest('.dhikr'); if (!d) return; const i = +d.dataset.i, item = sets[cur][1][i], k = cur + i;
      if ((cnt[k] || 0) >= item.n) return;
      cnt[k] = (cnt[k] || 0) + 1; U.vibrate(cnt[k] >= item.n ? [40, 40, 40] : 12);
      render();
      if (cnt[k] >= item.n) { const nx = $(`.dhikr[data-i="${i + 1}"]`); nx && nx.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    };
    $('#azR').onclick = () => { Object.keys(cnt).forEach(k => k.startsWith(cur) && delete cnt[k]); render(); };
    $('#azF').onclick = () => { size = Math.min(40, size + 2); store.set('azSize', size); render(); };
    $('#azF2').onclick = () => { size = Math.max(14, size - 2); store.set('azSize', size); render(); };
    render();
  },
});

Tools.add({
  id: 'zakat', cat: 'islam', icon: '🤲', name: 'حاسبة الزكاة', desc: 'زكاة المال والذهب والفضة', kw: 'zakat زكاة',
  render(el) {
    const s = store.get('zakat', { gold: 0, cash: 0, savings: 0, goldG: 0, silverG: 0, debts: 0, gp: 0 });
    el.innerHTML = `<div class="card"><div class="form-grid">
      <label>النقد بالبيت والبنك €<input id="zCash" type="number" value="${s.cash || ''}"></label>
      <label>مدخرات واستثمارات وأسهم €<input id="zSav" type="number" value="${s.savings || ''}"></label>
      <label>ذهب للادخار (غرام، عيار 24 مكافئ)<input id="zG" type="number" value="${s.goldG || ''}"></label>
      <label>فضة (غرام)<input id="zS" type="number" value="${s.silverG || ''}"></label>
      <label>ديون عليك مستحقة الآن €<input id="zD" type="number" value="${s.debts || ''}"></label>
      <label>سعر غرام الذهب اليوم €<input id="zGP" type="number" step="0.01" value="${s.gp || ''}" placeholder="مثال: 75"></label>
      <label>سعر غرام الفضة اليوم €<input id="zSP" type="number" step="0.01" value="${s.sp || ''}" placeholder="مثال: 0.9"></label>
      <label>النصاب على أساس<select id="zN"><option value="gold" ${s.nisab !== 'silver' ? 'selected' : ''}>الذهب (85 غ)</option><option value="silver" ${s.nisab === 'silver' ? 'selected' : ''}>الفضة (595 غ)</option></select></label>
      </div><div class="res big" id="zO"></div><p class="muted">الزكاة 2.5% من المال إذا بلغ النصاب وحال عليه الحول (سنة هجرية). أدخل أسعار الذهب والفضة الحالية. للمسائل الخاصة ارجع لأهل العلم.</p></div>`;
    const v = id => +$(id).value || 0;
    const calc = () => {
      const d = { cash: v('#zCash'), savings: v('#zSav'), goldG: v('#zG'), silverG: v('#zS'), debts: v('#zD'), gp: v('#zGP'), sp: v('#zSP'), nisab: $('#zN').value }; store.set('zakat', d);
      const total = d.cash + d.savings + d.goldG * d.gp + d.silverG * d.sp - d.debts;
      const nisab = d.nisab === 'silver' ? 595 * d.sp : 85 * d.gp;
      if (!nisab) { $('#zO').innerHTML = 'أدخل سعر غرام ' + (d.nisab === 'silver' ? 'الفضة' : 'الذهب') + ' لحساب النصاب'; return; }
      $('#zO').innerHTML = `المال الخاضع: <b>${U.money(total)}</b> · النصاب: <b>${U.money(nisab)}</b><br>` + (total >= nisab ? `الزكاة الواجبة: <b class="pos">${U.money(total * 0.025)}</b>` : 'لم يبلغ النصاب — لا زكاة عليك');
    };
    el.addEventListener('input', calc); calc();
  },
});

Tools.add({
  id: 'hijri', cat: 'islam', icon: '🌙', name: 'التاريخ الهجري', desc: 'تحويل ميلادي ↔ هجري ومناسبات', kw: 'hijri هجري تقويم رمضان',
  render(el) {
    const HF = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
    const parts = d => { const p = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(d); const g = t => +p.find(x => x.type === t).value; return { d: g('day'), m: g('month'), y: parseInt(p.find(x => x.type === 'year').value) }; };
    const h2g = (y, m, d) => { // بحث بسيط: نبدأ من تقدير ونصحح
      let t = new Date(Date.UTC(622, 6, 16) + ((y - 1) * 354.367 + (m - 1) * 29.53 + (d - 1)) * 864e5);
      for (let i = 0; i < 80; i++) { const p = parts(t); const diff = (y - p.y) * 354 + (m - p.m) * 29.5 + (d - p.d); if (Math.abs(diff) < 0.5) return t; t = new Date(t.getTime() + Math.round(diff) * 864e5); }
      return t;
    };
    const today = parts(new Date());
    const months = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];
    el.innerHTML = `<div class="card center"><div class="big-num sm">${HF.format(new Date())}</div></div>
      <div class="grid two"><div class="card"><h3>ميلادي ← هجري</h3><input id="hG" type="date" value="${U.today()}"><div class="res" id="hGO"></div></div>
      <div class="card"><h3>هجري ← ميلادي</h3><div class="row wrap"><input id="hD" type="number" min="1" max="30" value="${today.d}" style="width:70px"><select id="hM">${months.map((m, i) => `<option value="${i + 1}" ${i + 1 === today.m ? 'selected' : ''}>${m}</option>`).join('')}</select><input id="hY" type="number" value="${today.y}" style="width:90px"></div><div class="res" id="hHO"></div></div></div>
      <div class="card"><h3>المناسبات القادمة</h3><div id="hEv"></div><small class="muted">حسب تقويم أم القرى — قد يختلف يوم حسب رؤية الهلال ببلدك</small></div>`;
    const calc = () => {
      if ($('#hG').value) $('#hGO').innerHTML = `<b>${HF.format(new Date($('#hG').value + 'T12:00'))}</b>`;
      const g = h2g(+$('#hY').value, +$('#hM').value, +$('#hD').value);
      $('#hHO').innerHTML = `<b>${g.toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'latn' })}</b>`;
    };
    const EV = [[9, 1, 'بداية رمضان 🌙'], [10, 1, 'عيد الفطر 🎉'], [12, 9, 'يوم عرفة'], [12, 10, 'عيد الأضحى 🐑'], [1, 1, 'رأس السنة الهجرية'], [1, 10, 'يوم عاشوراء'], [3, 12, 'المولد النبوي'], [7, 27, 'الإسراء والمعراج']];
    const now = new Date(); const list = [];
    for (const [m, d, n] of EV) for (const y of [today.y, today.y + 1]) { const g = h2g(y, m, d); if (g >= new Date(now.toDateString())) { list.push([g, n, y]); break; } }
    list.sort((a, b) => a[0] - b[0]);
    $('#hEv').innerHTML = `<table class="tbl">${list.map(([g, n]) => `<tr><td>${n}</td><td>${g.toLocaleDateString('ar', { day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'latn' })}</td><td><b>${Math.ceil((g - now) / 864e5)}</b> يوم</td></tr>`).join('')}</table>`;
    el.addEventListener('input', calc); calc();
  },
});
