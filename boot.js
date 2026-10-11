/* boot.js — التشغيل النهائي */
'use strict';
Tools.init();
router.on('tools', () => { Tools.close(); Tools.renderGrid(); });
router.on('tool', id => Tools.open(id));
const _go = router.go.bind(router);
router.go = async function () { if (!location.hash.startsWith('#/tool/')) Tools.close(); return _go(); };
// نسخة الجوال: تعمل بدون إنترنت بعد أول فتح
if (window.HL_LOCAL && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}
if (window.HL_LOCAL) document.documentElement.classList.add('mobile-app');
router.go();
