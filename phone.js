/* phone.js — الوصول من الجوال: QR + رمز الدخول */
'use strict';
const Phone = {
  qr(text) {
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    return q.createDataURL(6, 2);
  },
  async open() {
    let d;
    try { d = await api.get('/api/lan'); } catch (e) { return toastErr(e); }
    if (!d.local) {
      modal.open(`<h3>📱 هذا الجهاز</h3><p class="muted">انت داخل من جهاز تاني (مو اللابتوب). لتضيف الصفحة كتطبيق: من قائمة المتصفح اختر <b>"إضافة إلى الشاشة الرئيسية"</b>.</p>
        <div class="actions"><button class="btn" id="mNo">إغلاق</button><button class="btn danger" id="pOut">تسجيل خروج</button></div>`, () => {
        $('#mNo').onclick = () => modal.close();
        $('#pOut').onclick = async () => { await api.post('/api/logout', {}); location.reload(); };
      });
      return;
    }
    if (!d.lan) {
      modal.open(`<h3>📱 الوصول من الجوال</h3><p class="muted">البرنامج شغال بوضع "لابتوب فقط" (<code>--local</code>). شغّله بـ <b>start.bat</b> العادي بدون <code>--local</code> ليصير متاح للجوال.</p>
        <div class="actions"><button class="btn" id="mNo">تمام</button></div>`, () => $('#mNo').onclick = () => modal.close());
      return;
    }
    const url = d.urls[0];
    modal.open(`<h3>📱 افتح HomeLab على الجوال</h3>
      ${url ? `<div class="qr-box"><div class="qr"><img src="${this.qr(url)}" alt="QR"></div>
        <ol class="steps">
          <li>خلّي الجوال على <b>نفس الواي فاي</b> تبع البيت</li>
          <li>افتح الكاميرا ووجّهها على الكود</li>
          <li>أدخل رمز الدخول — مرة وحدة بس</li>
          <li>من قائمة المتصفح: <b>إضافة إلى الشاشة الرئيسية</b> وبيصير متل تطبيق</li>
        </ol></div>
        <p style="text-align:center;margin:14px 0 4px">أو اكتب بالمتصفح:<br><span class="url-pill">${esc(url)}</span>
        ${d.urls.length > 1 ? `<br><small class="muted">عناوين تانية: ${d.urls.slice(1).map(esc).join(' · ')}</small>` : ''}</p>`
        : `<p class="muted">ما لقيت اللابتوب متصل بشبكة. اتصل بالواي فاي وجرب مرة تانية.</p>`}
      <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
      ${d.first_pin ? `<p style="text-align:center;margin:0">رمز الدخول الحالي<br><span class="pin-big">${esc(d.first_pin)}</span></p>` : `<p class="muted" style="text-align:center;margin:0">رمز الدخول: الرمز اللي اخترته 🔒</p>`}
      <div class="row" style="margin-top:12px"><input id="newPin" type="text" inputmode="numeric" placeholder="رمز جديد (4 أرقام أو أكتر)" style="direction:ltr;text-align:center"><button class="btn primary" id="setPin">تغيير الرمز</button></div>
      <p class="muted" style="font-size:12px">تغيير الرمز بيطلّع كل الأجهزة المسجلة. اللابتوب نفسه ما بيحتاج رمز.</p>
      <div class="actions"><button class="btn" id="mNo">إغلاق</button></div>`, () => {
      $('#mNo').onclick = () => modal.close();
      $('#setPin').onclick = async () => {
        const pin = $('#newPin').value.trim();
        try { await api.post('/api/set-pin', { pin }); toast('تم تغيير الرمز ✔', 'ok'); modal.close(); this.open(); } catch (e) { toastErr(e); }
      };
    });
  },
};
// يُفتح من صفحة الإعدادات
