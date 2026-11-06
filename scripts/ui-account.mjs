// Đổi tài khoản Google (máy chủ GIẢ LẬP, không chạm máy chủ thật): luôn hiện bảng chọn tài khoản; dữ liệu người trước KHÔNG sang
// tài khoản người sau, cũng không ghi dấu "đã xoá" lên tài khoản; đăng xuất chỉ máy này; khách dùng chưa đăng nhập vẫn giữ dữ liệu.
// Chạy sau `npm run build`: node scripts/ui-account.mjs
import { readFileSync } from 'node:fs'
import { T, launch, startPreview } from './ui-lib.mjs'
let url = ''
try { url = /^VITE_SUPABASE_URL=(.+)$/m.exec(readFileSync('.env.local', 'utf8'))?.[1]?.trim() ?? '' } catch { /* không có file */ }
if (!url) { console.log('XANH (bỏ qua: bản này chưa nối máy chủ)'); process.exit(0) }
const KEY = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const session = id => {
  const exp = Math.floor(Date.now() / 1000) + 3600
  return { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: id, exp, aud: 'authenticated', role: 'authenticated' })}.x`, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id, aud: 'authenticated', email: `${id}@thu.vn`, app_metadata: {}, user_metadata: { full_name: `Người ${id}` } } }
}
const backup = (o, t) => ({ app: 'malcargo', version: 1, items: [], vehicles: [], orders: [{ id: o, name: `Đơn ${o}`, place: '', lines: [], updatedAt: 1000 }], trips: [{ id: t, name: `Chuyến ${t}`, vehicleId: null, orderIds: [o], updatedAt: 1000 }], pallet: { l: 1200, w: 1000, maxH: 1650, baseH: 150, kg: 25 }, deleted: {} })
const srv = await startPreview(4187), BASE = 'http://localhost:4187/'
const b = await launch()
let bad = 0
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) bad++ }
const fresh = async () => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
  const srvData = { userA: backup('a-o1', 'a-t1'), userB: backup('b-o1', 'b-t1') }, log = { saves: [], authorize: [], logout: [] }
  const who = r => { try { return JSON.parse(Buffer.from((r.headers().authorization ?? '').split('.')[1], 'base64url').toString()).sub } catch { return null } }
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url(), me = who(r.request())
    const json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (u.includes('/rpc/user_save')) { const d = r.request().postDataJSON(); log.saves.push({ me, data: d.p_data }); srvData[me] = d.p_data; return json(log.saves.length + 1) }
    if (u.includes('/user_data')) return srvData[me] ? json({ data: srvData[me], version: 1 }) : json(null)
    if (u.includes('/rpc/is_admin') || u.includes('/rpc/is_super_admin')) return json(false)
    return json(u.includes('/rpc/') ? null : [])
  })
  await ctx.route('**/auth/v1/**', r => {
    const u = r.request().url()
    if (u.includes('/authorize')) { log.authorize.push(u); return r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Google</h1>' }) }
    if (u.includes('/logout')) { log.logout.push(u); return r.fulfill({ status: 204 }) }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message))
  await p.goto(BASE, { waitUntil: 'load' })
  const signInAs = async id => {
    await p.evaluate(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, session(id)])
    await p.goto(BASE, { waitUntil: 'load' }); await p.reload({ waitUntil: 'load' })
    await p.getByRole('button', { name: new RegExp(T('Tài khoản {name}', { name: `Người ${id}` })) }).waitFor({ timeout: 15000 }); await p.waitForTimeout(1800)
  }
  const mine = () => p.evaluate(() => JSON.parse(localStorage.getItem('malcargo-data-v1') ?? '{"state":{}}').state)
  const menu = async (id, label) => { await p.getByRole('button', { name: new RegExp(T('Tài khoản {name}', { name: `Người ${id}` })) }).click(); await p.waitForTimeout(250); await p.getByRole('button', { name: T(label), exact: true }).last().click() }
  return { ctx, p, log, signInAs, mine, menu, errs }
}
const hasA = d => JSON.stringify(d).includes('a-o1') || JSON.stringify(d).includes('a-t1')

console.log('— Đổi tài khoản từ menu')
{
  const { ctx, p, log, signInAs, mine, menu, errs } = await fresh()
  await signInAs('userA')
  ok(hasA(await mine()), 'A đăng nhập: dữ liệu A về máy')
  await menu('userA', 'Đổi tài khoản')
  await p.waitForURL(/\/authorize/, { timeout: 10000 })
  ok(log.authorize.at(-1)?.includes('prompt=select_account'), 'mở Google kèm bảng chọn tài khoản')
  ok(log.logout.at(-1)?.includes('scope=local'), 'chỉ đăng xuất máy này')
  await p.goto(BASE, { waitUntil: 'load' }); await p.waitForTimeout(800)
  let st = await mine()
  ok(!hasA(st), 'huỷ ở Google: máy không còn dữ liệu A')
  ok(!Object.keys(st.deleted ?? {}).length, 'không có dấu đã xoá')
  await signInAs('userB')
  const toB = log.saves.filter(s => s.me === 'userB')
  ok(toB.length && toB.every(s => !hasA(s.data)), 'B đăng nhập: không gửi dữ liệu A lên tài khoản B')
  st = await mine()
  ok(!hasA(st) && JSON.stringify(st).includes('b-o1'), 'máy có dữ liệu B, không có A')
  ok(!log.saves.filter(s => s.me === 'userA').some(s => !hasA(s.data) || Object.keys(s.data.deleted ?? {}).some(k => k.startsWith('a-'))), 'tài khoản A không bị xoá gì')
  ok(!errs.length, 'không lỗi trình duyệt ' + errs.join())
  await ctx.close()
}
console.log('— Trang đóng giữa chừng, B đăng nhập khi dữ liệu A còn trên máy')
{
  const { ctx, log, signInAs, mine } = await fresh()
  await signInAs('userA')
  await signInAs('userB')
  ok(!log.saves.filter(s => s.me === 'userB').some(s => hasA(s.data)) && !hasA(await mine()), 'dữ liệu A không sang B')
  await ctx.close()
}
console.log('— Đăng xuất')
{
  const { ctx, p, signInAs, mine, menu } = await fresh()
  await signInAs('userA')
  await menu('userA', 'Đăng xuất'); await p.waitForTimeout(800)
  ok(!hasA(await mine()), 'đăng xuất: dữ liệu A rời máy')
  await signInAs('userA')
  ok(hasA(await mine()), 'A đăng nhập lại: dữ liệu về đủ')
  await ctx.close()
}
console.log('— Còn thay đổi chưa lưu lên máy chủ lúc đăng xuất')
{
  const { ctx, p, signInAs, mine, menu } = await fresh()
  await signInAs('userA')
  await p.evaluate(() => localStorage.setItem('malcargo-dirty-v1', '["me"]'))
  await menu('userA', 'Đăng xuất'); await p.waitForTimeout(800)
  ok(hasA(await mine()), 'chưa lưu xong: giữ trên máy, không mất')
  await signInAs('userA')
  ok(hasA(await mine()), 'A đăng nhập lại: vẫn còn')
  await ctx.close()
}
console.log('— Khách chưa đăng nhập')
{
  const { ctx, p, log, signInAs, mine } = await fresh()
  const guest = { state: { ...backup('g-o1', 'g-t1') }, version: 0 }
  await p.evaluate(g => localStorage.setItem('malcargo-data-v1', JSON.stringify(g)), guest)
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1000); await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800)
  ok(JSON.stringify(await mine()).includes('g-o1'), 'mở lại app: dữ liệu khách vẫn còn')
  await signInAs('userA')
  ok(log.saves.filter(s => s.me === 'userA').some(s => JSON.stringify(s.data).includes('g-o1')), 'đăng nhập lần đầu: dữ liệu khách chuyển lên tài khoản')
  await ctx.close()
}
await b.close(); srv?.close?.(); console.log(bad ? `ĐỎ ${bad}` : 'XANH'); process.exit(bad ? 1 : 0)
