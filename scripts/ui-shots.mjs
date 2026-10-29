// Chụp mọi màn ở 1440 + 390, đo tràn ngang, gom lỗi trình duyệt. Ảnh ra scripts/out/.
// Chạy: npm run build && node scripts/ui-shots.mjs [tên-màn]
import { DEVICES, OUT, launch, startPreview, watchErrors } from './ui-lib.mjs'

const only = process.argv[2]
const PAGES = [
  ['trips', '#/trips', 800], ['trip', '#/trip/sample-t1', 6000], ['orders', '#/orders', 600],
  ['order', '#/order/sample-o1', 800], ['items', '#/items', 600], ['vehicles', '#/vehicles', 600], ['account', '#/account', 600],
]
const srv = await startPreview()
const b = await launch()
let bad = 0
for (const dev of DEVICES) {
  const ctx = await b.newContext(dev)
  const p = await ctx.newPage()
  const errs = watchErrors(p)
  await p.goto(srv.base + '#/trips', { waitUntil: 'networkidle' })
  for (const [name, hash, wait] of PAGES) {
    if (only && name !== only) continue
    await p.evaluate(h => { location.hash = h }, hash)
    await p.waitForTimeout(wait)
    const sw = await p.evaluate(() => document.documentElement.scrollWidth)
    await p.screenshot({ path: `${OUT}/${dev.name}-${name}.jpg`, type: 'jpeg', quality: 78 })
    if (sw > dev.viewport.width) { bad++; console.log(`✗ ${dev.name} ${name}: tràn ngang ${sw}px`) }
  }
  if (!only || only === 'trip') {
    // giữa chừng bước xếp + tab đếm chân + xe pallet (đổi bằng giao diện, trả lại xe cũ)
    await p.evaluate(() => { location.hash = '#/trip/sample-t1' }); await p.waitForTimeout(4000)
    await p.evaluate(() => {
      const r = document.querySelector('input[type=range].steps')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(r, String(Math.round(Number(r.max) * 0.55)))
      r.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await p.waitForTimeout(800)
    await p.screenshot({ path: `${OUT}/${dev.name}-step.jpg`, type: 'jpeg', quality: 78 })
    // bước 3 (bảng đếm chân) mặc định thu gọn — bấm để mở
    await p.getByRole('button', { name: /Bảng đếm chân/ }).click(); await p.waitForTimeout(400)
    await p.getByRole('button', { name: /Bảng đếm chân/ }).scrollIntoViewIfNeeded()
    await p.screenshot({ path: `${OUT}/${dev.name}-count.jpg`, type: 'jpeg', quality: 78 })
    // đổi xe: bấm ô tên xe trên dải thông số ⇒ danh sách thả ngay dưới (như bộ lọc Excel); cuối danh sách ⇒ bảng Thùng xe
    await p.evaluate(() => window.scrollTo(0, 0))
    await p.getByRole('button', { name: 'Đổi xe' }).click(); await p.waitForTimeout(600)
    await p.screenshot({ path: `${OUT}/${dev.name}-spec-pick.jpg`, type: 'jpeg', quality: 78 })
    await p.locator('[data-popover]').getByRole('button', { name: 'Chỉnh thông số thùng xe' }).click(); await p.waitForTimeout(300)
    await p.screenshot({ path: `${OUT}/${dev.name}-spec-open.jpg`, type: 'jpeg', quality: 78 })
    await p.keyboard.press('Escape'); await p.waitForTimeout(200)
    await p.getByRole('button', { name: 'Đổi xe' }).click(); await p.waitForTimeout(400)
    await p.locator('[data-popover]').getByText('Xe pallet 8 tấn', { exact: true }).click(); await p.waitForTimeout(4500)
    await p.screenshot({ path: `${OUT}/${dev.name}-pallet.jpg`, type: 'jpeg', quality: 78 })
    await p.getByRole('button', { name: 'Đổi xe' }).click(); await p.waitForTimeout(400)
    await p.locator('[data-popover]').getByText('Xe tải 5 tấn', { exact: true }).click(); await p.waitForTimeout(300)
    // mở danh mục Mã hàng ngay trên bàn xếp xe (máy tính: thanh trên · điện thoại: nút Danh mục)
    await p.getByRole('button', { name: 'Danh mục' }).click(); await p.waitForTimeout(300)
    await p.screenshot({ path: `${OUT}/${dev.name}-menu.jpg`, type: 'jpeg', quality: 78 })
    await p.getByRole('button', { name: 'Mã hàng', exact: true }).first().click()
    await p.waitForTimeout(500)
    await p.screenshot({ path: `${OUT}/${dev.name}-panel.jpg`, type: 'jpeg', quality: 78 })
    await p.getByRole('button', { name: 'Đóng' }).click(); await p.waitForTimeout(200)
    // chọn chuyến (cạnh nút +) và hướng dẫn đăng nhập
    await p.getByRole('button', { name: /^Chuyến đang mở/ }).click(); await p.waitForTimeout(300)
    await p.screenshot({ path: `${OUT}/${dev.name}-trips-menu.jpg`, type: 'jpeg', quality: 78 })
    await p.keyboard.press('Escape'); await p.waitForTimeout(150)
    await p.getByRole('button', { name: 'Login' }).click(); await p.waitForTimeout(300)
    await p.screenshot({ path: `${OUT}/${dev.name}-login.jpg`, type: 'jpeg', quality: 78 })
    await p.keyboard.press('Escape'); await p.mouse.move(5, 400); await p.waitForTimeout(150)
    // khung tên mở rộng: số thùng từng đơn
    await p.getByRole('button', { name: /^Kết quả:/ }).click(); await p.waitForTimeout(300)
    await p.screenshot({ path: `${OUT}/${dev.name}-titleblock.jpg`, type: 'jpeg', quality: 78 })
    await p.getByRole('button', { name: /^Kết quả:/ }).click()
    // nhập từ Excel (mở từ nút Danh mục) — điện thoại không có
    if (!dev.isMobile) {
      await p.getByRole('button', { name: 'Danh mục' }).click(); await p.waitForTimeout(200)
      await p.getByRole('button', { name: 'Nhập từ Excel' }).click(); await p.waitForTimeout(400)
      await p.screenshot({ path: `${OUT}/${dev.name}-import.jpg`, type: 'jpeg', quality: 78 })
      await p.keyboard.press('Escape'); await p.waitForTimeout(150)
    }
  }
  if (errs.length) { bad++; console.log(`✗ ${dev.name} lỗi trình duyệt:`, errs) }
  await ctx.close()
}
await b.close(); await srv.close()
console.log(bad ? `${bad} vấn đề — xem ảnh trong ${OUT}` : `XANH — ảnh trong ${OUT}`)
process.exit(bad ? 1 : 0)
