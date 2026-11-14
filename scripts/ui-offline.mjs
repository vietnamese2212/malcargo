// App mở được khi MẤT MẠNG: tải một lần có mạng (service worker lưu bản app) ⇒ ngắt mạng ⇒ tải lại vẫn ra Bàn xếp xe,
// sơ đồ 3D vẫn tính (worker + three.js lấy từ bản đã lưu), sửa số vẫn lưu trên máy. Chạy sau `npm run build`.
import { OUT, T, launch, startPreview, watchErrors } from './ui-lib.mjs'
const srv = await startPreview(4193)
const b = await launch()
let bad = 0
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) bad++ }
const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })
await ctx.addInitScript(() => localStorage.setItem('malcargo-sw-test', '1'))
const p = await ctx.newPage(); const errs = watchErrors(p)
await p.goto(srv.base + '#/trip/sample-t2', { waitUntil: 'networkidle' })
const ready = await p.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise(r => setTimeout(() => r(false), 15000))]))
ok(ready, 'có mạng: service worker cài xong')
await p.waitForTimeout(1500)
await ctx.setOffline(true)
await p.reload({ waitUntil: 'load' }).catch(() => {})
const verdict = p.locator('[data-scene]').getByText(new RegExp(T('Vừa xe') + '|' + T('Quá tải')))
const shown = await verdict.first().waitFor({ timeout: 30000 }).then(() => true, () => false)
ok(shown, 'mất mạng, tải lại: Bàn xếp xe mở, sơ đồ Mẫu 40ft vẫn tính ra kết quả')
ok(await p.locator('[data-scene] canvas').count() === 1, 'mất mạng: khung 3D vẫn vẽ')
await p.goto(srv.base + 's/KHONGMANG1', { waitUntil: 'load' }).catch(() => {})
ok(await p.locator('[data-tour=trip]').waitFor({ timeout: 15000 }).then(() => true, () => false), 'mất mạng, mở bằng link /s/<mã>: app vẫn lên (không trắng màn)')
await p.screenshot({ path: `${OUT}/offline-390.png` })
const real = errs.filter(e => !/Failed to fetch|ERR_INTERNET_DISCONNECTED|NetworkError|Load failed/i.test(e))
ok(!real.length, 'không lỗi trình duyệt ngoài lỗi mất mạng' + (real.length ? ': ' + real.join(' | ') : ''))
await b.close(); await srv.close()
console.log(bad ? `${bad} phép HỎNG` : 'XANH')
process.exit(bad ? 1 : 0)
