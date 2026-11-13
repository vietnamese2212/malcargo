// Family mở / đóng, link xin vào, duyệt, phân vai, chuyển quyền, người chỉ xem (chủ dự án 13/11) — máy chủ GIẢ LẬP, không chạm
// máy chủ thật. Chạy sau `npm run build`: node scripts/ui-family.mjs. Ảnh ra scripts/out/family-*.png để xem bằng mắt.
import { readFileSync } from 'node:fs'
import { OUT, T, launch, startPreview } from './ui-lib.mjs'
let url = ''
try { url = /^VITE_SUPABASE_URL=(.+)$/m.exec(readFileSync('.env.local', 'utf8'))?.[1]?.trim() ?? '' } catch { /* không có file */ }
if (!url) { console.log('XANH (bỏ qua: bản này chưa nối máy chủ)'); process.exit(0) }
const KEY = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const session = id => {
  const exp = Math.floor(Date.now() / 1000) + 3600
  return { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, exp, aud: 'authenticated', role: 'authenticated' })}.x`, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id, aud: 'authenticated', email: `${id}@thu.vn`, app_metadata: {}, user_metadata: { full_name: `Người ${id}` } } }
}
const PAL = { l: 1200, w: 1000, maxH: 1650, baseH: 150, kg: 25 }
const FAM = { app: 'malcargo', version: 1, items: [], vehicles: [], pallet: PAL, deleted: {},
  orders: [{ id: 'fo-1', name: 'Don Family', place: 'Kho Q7', lines: [], updatedAt: 1000, by: 'Nguoi A', madeBy: 'usera@thu.vn' },
    // chủ nạp đơn từ Excel, chưa vào chuyến nào (chủ dự án 13/11: thành viên không thấy trong ô Chuyến xe)
    { id: 'fo-2', name: 'Don Le 1', place: 'Kho B', lines: [{ itemId: 'adm-i-c110', qty: 12 }], updatedAt: 1001 },
    { id: 'fo-3', name: 'Don Le 2', place: 'Kho C', lines: [{ itemId: 'adm-i-c110', qty: 8 }], updatedAt: 1002 }],
  trips: [{ id: 'ft-1', name: 'Chuyen Family', vehicleId: null, orderIds: ['fo-1'], updatedAt: 1000, by: 'Nguoi A', madeBy: 'usera@thu.vn' }] }
const PEEK_OPEN = { id: 'fam1', name: 'Cty Thu', open: true, people: 3, me: null, orders: [
  { id: 'o1', name: 'Don HN', place: 'Ha Noi', by: 'Nguoi A', updatedAt: Date.now(), lines: [{ code: 'SP002', name: 'TBA 180', qty: 120, kg: 9.85 }, { code: 'SP008', name: 'ECOLEAN', qty: 40, kg: 3.08 }] },
  { id: 'o2', name: 'Don HCM', place: '', by: null, updatedAt: Date.now() - 864e5 * 3, lines: [{ code: 'X1', name: 'Hang X', qty: 10, kg: null }] }] }
const PEEK_CLOSED = { id: 'fam1', name: 'Cty Thu', open: false, people: 3, me: null, orders: null }

const srv = await startPreview(4188), BASE = 'http://localhost:4188/'
const b = await launch()
let bad = 0
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) bad++ }

/** Một trình duyệt + máy chủ giả: `me` = vai của userA trong Family 'fam1'. */
async function fresh({ role = 'owner', peek = PEEK_OPEN, viewport = { width: 1280, height: 800 } } = {}) {
  const ctx = await b.newContext({ viewport })
  const log = []
  const st = {
    fam: { id: 'fam1', name: 'Cty Thu', discount_code: null, paid_until: null, open: false, link: null, created_at: '2026-11-01' },
    members: [
      { family_id: 'fam1', email: 'usera@thu.vn', name: 'Người userA', role, status: 'active', invited_at: '2026-11-01' },
      ...(role === 'owner' ? [] : [{ family_id: 'fam1', email: 'chu@thu.vn', name: 'Chu', role: 'owner', status: 'active', invited_at: '2026-11-01' }]),
      { family_id: 'fam1', email: 'tv@thu.vn', name: 'Thanh vien', role: 'member', status: 'active', invited_at: '2026-11-02' },
      { family_id: 'fam1', email: 'xin@thu.vn', name: 'Nguoi xin', role: 'member', status: 'requested', invited_at: '2026-11-12' },
    ],
    peek: structuredClone(peek), requested: false,
  }
  const who = r => { try { return JSON.parse(Buffer.from((r.headers().authorization ?? '').split('.')[1], 'base64url').toString()).sub } catch { return null } }
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url(), me = who(r.request()), signed = me && me !== 'anon'
    const json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    const body = () => { try { return r.request().postDataJSON() ?? {} } catch { return {} } }
    const rpc = /\/rpc\/(\w+)/.exec(u)?.[1]
    if (rpc) log.push({ rpc, args: body() })
    if (rpc === 'family_peek') {
      const p = structuredClone(st.peek)
      if (signed && st.requested) p.me = { status: 'requested', role: 'member' }
      return json(body().p_code === 'LINKFAM001' ? p : null)
    }
    if (rpc === 'family_request') { st.requested = true; return json({ id: 'fam1', status: 'requested' }) }
    if (rpc === 'family_decline') { st.requested = false; return json(null) }
    if (rpc === 'family_link') { st.fam.link = body().p_new ? 'LINKFAM002' : (st.fam.link ?? 'LINKFAM001'); return json(st.fam.link) }
    if (rpc === 'family_set_open') { st.fam.open = !!body().p_open; return json(null) }
    if (rpc === 'family_approve') { const m = st.members.find(x => x.email === body().p_email); if (m) m.status = 'active'; return json(null) }
    if (rpc === 'family_remove') { st.members = st.members.filter(x => x.email !== body().p_email); return json(null) }
    if (rpc === 'family_set_role') { const m = st.members.find(x => x.email === body().p_email); if (m) m.role = body().p_role; return json(null) }
    if (rpc === 'family_transfer') {
      st.members.forEach(m => { if (m.email === 'usera@thu.vn') m.role = 'manager'; if (m.email === body().p_email) m.role = 'owner' })
      return json(null)
    }
    if (rpc === 'family_fee') return json({ price: 0, people: 3, code: null, percent: 0, paid_until: null })
    if (rpc === 'family_since') return json({ version: 3, full: true, data: FAM })
    if (rpc === 'family_sync') return json({ version: 4, others: false })
    if (rpc === 'user_sync') return json({ version: 2, others: false })
    if (rpc === 'user_since') return json(null)
    if (rpc === 'is_admin' || rpc === 'is_super_admin') return json(false)
    if (u.includes('/families')) return json(signed ? [st.fam] : [])
    if (u.includes('/family_members')) return json(signed ? st.members : [])
    if (u.includes('/family_data')) return json(signed ? { data: FAM, version: 3 } : null)
    if (u.includes('/user_data')) return json(null)
    return json(rpc ? null : [])
  })
  await ctx.route('**/auth/v1/**', r => {
    const u = r.request().url()
    if (u.includes('/authorize')) { log.push({ authorize: u }); return r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Google</h1>' }) }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message))
  await p.goto(BASE, { waitUntil: 'load' })
  const signIn = async () => {
    await p.evaluate(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session('userA')])
    await p.goto(BASE, { waitUntil: 'load' }); await p.reload({ waitUntil: 'load' })
    await p.getByRole('button', { name: new RegExp(T('Tài khoản {name}', { name: 'Người userA' })) }).waitFor({ timeout: 15000 }); await p.waitForTimeout(1500)
  }
  const panel = async () => {
    await p.getByRole('button', { name: T('Danh mục'), exact: true }).click(); await p.waitForTimeout(250)
    await p.locator('[data-popover]').getByRole('button', { name: /^Family/ }).click(); await p.waitForTimeout(700)
  }
  return { ctx, p, log, st, errs, signIn, panel }
}
const calls = (log, rpc) => log.filter(x => x.rpc === rpc)

console.log('— Khách mở link Family MỞ: xem đơn hàng, không sửa / không lưu bản sao')
{
  const { ctx, p, log, errs } = await fresh({ viewport: { width: 390, height: 844 } })
  await p.goto(BASE + 'f/LINKFAM001', { waitUntil: 'load' }); await p.waitForTimeout(1500)
  const sh = p.getByRole('dialog')
  await sh.getByText('Don HN').waitFor({ timeout: 10000 }).catch(() => {})
  ok(await sh.getByText('Family Cty Thu').first().isVisible() && !p.url().includes('/f/'), 'mở tấm Family, địa chỉ về trang gốc' + ' [' + p.url() + ']')
  ok(await sh.getByText('Don HN').isVisible() && await sh.getByText('SP002').isVisible() && await sh.getByText(T('Sửa bởi {name} · {time}', { name: 'Nguoi A', time: '' }).trim(), { exact: false }).first().isVisible(), 'thấy đơn, dòng mã, người sửa')
  ok(await sh.getByText(T('{n} thùng', { n: '160' })).isVisible(), 'cộng số thùng của đơn')
  ok(!(await sh.getByRole('button', { name: T('Lưu bản sao') }).count()) && !(await sh.getByRole('textbox').count()), 'không có nút lưu bản sao / ô sửa')
  ok(!(await p.locator('[data-family-gate]').innerText()).includes('Chuyen Family'), 'không lộ chuyến')
  await p.screenshot({ path: `${OUT}/family-gate-open-390.png` })
  // khách bấm xin vào ⇒ đi đăng nhập, nhớ link để quay về
  await sh.getByRole('button', { name: T('Đăng nhập để xin vào') }).click()
  await p.waitForURL(/\/authorize/, { timeout: 10000 }).catch(() => {})
  ok(log.some(x => x.authorize), 'chưa đăng nhập ⇒ đi đăng nhập Google')
  ok(!errs.length, 'không lỗi trình duyệt' + (errs.length ? ': ' + errs.join(' | ') : ''))
  await ctx.close()
}

console.log('— Link Family ĐÓNG; đăng nhập xong quay về tấm, xin vào, rút yêu cầu')
{
  const { ctx, p, log, st, errs } = await fresh({ peek: PEEK_CLOSED })
  await p.goto(BASE + 'f/LINKFAM001', { waitUntil: 'load' }); await p.waitForTimeout(1500)
  const sh = p.getByRole('dialog')
  ok(await sh.getByText(T('Family này đóng — chỉ người trong Family xem được dữ liệu.')).isVisible(), 'Family đóng: chỉ tên + lời báo')
  await sh.getByRole('button', { name: T('Đăng nhập để xin vào') }).click()
  await p.waitForURL(/\/authorize/, { timeout: 10000 }).catch(() => {})
  // "đăng nhập xong": Google trả về trang gốc ⇒ tấm tự mở lại
  await ctx.addInitScript(([k, s]) => { if (location.port === '4188') localStorage.setItem(k, JSON.stringify(s)) }, [KEY, session('userB')])
  await p.goto(BASE, { waitUntil: 'load' }); await p.waitForTimeout(2500)
  const ask = p.getByRole('dialog').getByRole('button', { name: T('Xin vào Family') })
  ok(await ask.isVisible().catch(() => false), 'đăng nhập xong ⇒ tấm Family mở lại, có nút Xin vào')
  await ask.click(); await p.waitForTimeout(1200)
  ok(calls(log, 'family_request').length === 1 && st.requested, 'bấm Xin vào ⇒ gửi yêu cầu')
  ok(await p.getByRole('dialog').getByText(T('Đã gửi yêu cầu xin vào — chờ chủ Family duyệt.')).isVisible(), 'hiện "đang chờ duyệt"')
  await p.getByRole('dialog').getByRole('button', { name: T('Rút yêu cầu') }).click(); await p.waitForTimeout(1200)
  ok(calls(log, 'family_decline').length === 1 && await p.getByRole('dialog').getByRole('button', { name: T('Xin vào Family') }).isVisible(), 'rút yêu cầu ⇒ lại có nút Xin vào')
  await p.goto(BASE + 'f/SAILINK999', { waitUntil: 'load' }); await p.waitForTimeout(1500)
  ok(await p.getByRole('dialog').getByText(T('Link không đúng hoặc đã được đổi.')).isVisible(), 'link sai / đã đổi ⇒ báo')
  ok(!errs.length, 'không lỗi trình duyệt' + (errs.length ? ': ' + errs.join(' | ') : ''))
  await ctx.close()
}

console.log('— Chủ Family: mở / đóng, chia sẻ link, duyệt, phân vai, chuyển quyền')
for (const vw of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  const { ctx, p, log, st, errs, signIn, panel } = await fresh({ viewport: vw })
  await signIn()
  await p.getByRole('button', { name: T('Danh mục'), exact: true }).click(); await p.waitForTimeout(300)
  ok(await p.locator('[data-popover]').getByText(T('{n} xin vào', { n: 1 })).isVisible(), `${vw.width}px: menu ≡ có nhãn "1 xin vào"`)
  await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  await panel()
  const card = p.getByRole('dialog')
  ok(await card.getByRole('button', { name: T('Duyệt {email}', { email: 'xin@thu.vn' }) }).isVisible(), 'thấy người xin vào + nút Duyệt')
  await p.screenshot({ path: `${OUT}/family-owner-${vw.width}.png`, fullPage: false })
  await card.getByRole('button', { name: T('Duyệt {email}', { email: 'xin@thu.vn' }) }).click(); await p.waitForTimeout(800)
  ok(calls(log, 'family_approve').at(-1)?.args.p_email === 'xin@thu.vn' && !(await card.getByRole('button', { name: T('Duyệt {email}', { email: 'xin@thu.vn' }) }).count()), 'Duyệt ⇒ vào Family, hết dòng xin vào')
  const sw = card.getByRole('switch', { name: new RegExp(T('Mở cho người ngoài xem đơn hàng')) })
  await sw.click(); await p.waitForTimeout(800)
  ok(calls(log, 'family_set_open').at(-1)?.args.p_open === true && await sw.getAttribute('aria-checked') === 'true', 'bật Mở ⇒ máy chủ ghi mở')
  await card.getByRole('button', { name: T('Chia sẻ Family') }).click(); await p.waitForTimeout(900)
  const share = p.getByRole('dialog').filter({ hasText: T('Link Family') })
  ok((await share.locator('[data-family-url]').inputValue()).endsWith('/f/LINKFAM001'), 'Chia sẻ Family ⇒ có link /f/<mã>')
  await share.getByRole('button', { name: T('Đổi link') }).click(); await p.waitForTimeout(200)
  await p.getByRole('alertdialog').getByRole('button', { name: T('Đổi link') }).click(); await p.waitForTimeout(900)
  ok(calls(log, 'family_link').some(x => x.args.p_new === true) && (await share.locator('[data-family-url]').inputValue()).endsWith('/f/LINKFAM002'), 'Đổi link ⇒ link mới')
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  await card.getByRole('combobox', { name: T('Vai của {email}', { email: 'tv@thu.vn' }) }).selectOption('viewer'); await p.waitForTimeout(800)
  ok(calls(log, 'family_set_role').at(-1)?.args.p_role === 'viewer', 'đổi vai ⇒ Chỉ xem')
  await card.getByRole('button', { name: T('Chuyển quyền chủ') }).click(); await p.waitForTimeout(250)
  const dlg = p.getByRole('alertdialog')
  ok(await dlg.getByRole('combobox', { name: T('Chuyển quyền chủ cho') }).isVisible(), 'hộp chuyển quyền có chọn người')
  await dlg.getByRole('button', { name: T('Chuyển quyền'), exact: true }).click(); await p.waitForTimeout(900)
  ok(!!calls(log, 'family_transfer').at(-1)?.args.p_email && st.members.find(m => m.email === 'usera@thu.vn').role === 'manager', 'chuyển quyền ⇒ mình thành Quản lý')
  ok(await card.getByText(T('Quản lý'), { exact: true }).first().isVisible() && await card.getByRole('button', { name: T('Rời Family') }).isVisible(), 'sau chuyển quyền: nhãn Quản lý, có nút Rời Family')
  ok(!errs.length, 'không lỗi trình duyệt' + (errs.length ? ': ' + errs.join(' | ') : ''))
  await ctx.close()
}

console.log('— Thành viên: đơn chưa vào chuyến nào xếp lên chuyến mới (ô Chuyến xe ▾ + danh sách Đơn hàng)')
{
  const { ctx, p, errs, signIn } = await fresh({ role: 'member' })
  await signIn()
  await p.getByRole('button', { name: T('Danh mục'), exact: true }).click(); await p.waitForTimeout(250)
  await p.locator('[data-popover]').getByRole('radio', { name: 'Family Cty Thu' }).click(); await p.waitForTimeout(2500)
  await p.locator('[data-tour=trip]').click(); await p.waitForTimeout(400)
  const row = p.locator('[data-popover]').getByText(T('{n} đơn chưa vào chuyến nào', { n: 2 }))
  ok(await row.isVisible(), 'ô Chuyến xe ▾ có dòng "2 đơn chưa vào chuyến nào"')
  await row.click(); await p.waitForTimeout(500)
  const sh = p.locator('[data-sheet]').last()
  await sh.getByRole('button', { name: /Don Le 1/ }).click(); await sh.getByRole('button', { name: /Don Le 2/ }).click()
  const url0 = p.url()
  await sh.getByRole('button', { name: T('Xếp {n} đơn lên xe', { n: 2 }) }).click(); await p.waitForTimeout(1500)
  ok(p.url() !== url0 && await p.getByRole('button', { name: /Don Le 1/ }).first().isVisible() && await p.getByRole('button', { name: /Don Le 2/ }).first().isVisible(), 'chọn 2 đơn ⇒ chuyến mới chở đúng 2 đơn')
  await p.getByRole('button', { name: T('Danh mục'), exact: true }).click(); await p.waitForTimeout(250)
  await p.locator('[data-popover]').getByRole('button', { name: T('Đơn hàng'), exact: true }).click(); await p.waitForTimeout(800)
  await p.getByRole('dialog').getByRole('checkbox', { name: T('Chọn {name}', { name: 'Don Family' }) }).click()
  const url1 = p.url()
  await p.getByRole('button', { name: T('Xếp {n} đơn lên xe', { n: 1 }) }).click(); await p.waitForTimeout(1500)
  ok(p.url() !== url1 && !(await p.getByRole('dialog').count()) && await p.getByRole('button', { name: /Don Family/ }).first().isVisible(), 'danh sách Đơn hàng: chọn ⇒ Xếp lên xe ⇒ chuyến mới, tấm đóng')
  ok(!errs.length, 'không lỗi trình duyệt' + (errs.length ? ': ' + errs.join(' | ') : ''))
  await ctx.close()
}

console.log('— Người chỉ xem: không sửa được, có câu báo')
{
  const { ctx, p, log, errs, signIn } = await fresh({ role: 'viewer' })
  await signIn()
  await p.getByRole('button', { name: T('Danh mục'), exact: true }).click(); await p.waitForTimeout(250)
  await p.locator('[data-popover]').getByRole('radio', { name: 'Family Cty Thu' }).click(); await p.waitForTimeout(2500)
  const url0 = p.url()
  await p.getByRole('button', { name: T('Chuyến mới'), exact: true }).first().click(); await p.waitForTimeout(500)
  ok(await p.getByRole('status').getByText(T('Bạn chỉ có quyền xem dữ liệu Family này.')).isVisible() && p.url() === url0, 'bấm + Chuyến mới ⇒ báo chỉ xem, không sang chuyến trống')
  await p.waitForTimeout(1500)
  ok(!calls(log, 'family_sync').length, 'không gửi gì lên máy chủ')
  ok(!errs.length, 'không lỗi trình duyệt' + (errs.length ? ': ' + errs.join(' | ') : ''))
  await ctx.close()
}

await b.close(); await srv.close()
console.log(bad ? `\nĐỎ — ${bad} lỗi` : '\nXANH — Family')
process.exit(bad ? 1 : 0)
