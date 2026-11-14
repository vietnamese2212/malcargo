// Service worker: app mở được khi MẤT MẠNG (kho bãi sóng yếu). Bản build chèn danh sách file vào đây (vite.config.ts → dist/sw.js).
// - Trang (index.html): lấy MẠNG trước ⇒ có mạng là luôn bản mới nhất; mất mạng / mạng treo quá 4 giây ⇒ bản đã lưu.
// - /assets/* (tên có mã băm, không bao giờ đổi nội dung): lấy bản đã lưu trước.
// - Máy chủ dữ liệu (tên miền khác) và file tải về (APK): không đụng.
const VER = '__VER__', FILES = '__FILES__', CACHE = 'malcargo-' + VER

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()))
})
// giữ thêm MỘT bộ cũ: tab đang mở bản trước vẫn lấy được file chia nhỏ của nó (3D, worker) — xoá ngay thì tab đó hỏng
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => {
    const old = ks.filter(k => k.startsWith('malcargo-') && k !== CACHE).sort().reverse()
    return Promise.all(old.slice(1).map(k => caches.delete(k)))
  }).then(() => self.clients.claim()))
})

const keep = (req, res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)) } return res }

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('.apk')) return
  if (req.mode === 'navigate') {
    if (url.pathname === '/privacy.html') return
    // mọi địa chỉ của app (/, /s/<mã>, /f/<mã>) đều là index.html
    e.respondWith(new Promise(done => {
      const saved = () => caches.match('/', { ignoreSearch: true }).then(r => r || Response.error())
      const timer = setTimeout(() => saved().then(done), 4000)
      fetch(req).then(res => { clearTimeout(timer); if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('/', copy)) } done(res) })
        .catch(() => { clearTimeout(timer); saved().then(done) })
    }))
    return
  }
  e.respondWith(caches.match(req, { ignoreSearch: url.pathname.startsWith('/assets/') }).then(hit => hit || fetch(req).then(res => keep(req, res))))
})
