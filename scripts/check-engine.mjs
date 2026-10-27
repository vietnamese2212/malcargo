// Kiểm lớp tính toán ngoài trình duyệt: bất biến hình học + bảng đếm chân + thời gian.
// Chạy: npm test
import { buildSync } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'malcargo-'))
const out = join(dir, 'engine.mjs')
buildSync({ entryPoints: ['scripts/engine-entry.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' })
const E = await import(pathToFileURL(out).href)
rmSync(dir, { recursive: true, force: true })

let fail = 0
const ok = (cond, msg) => { if (!cond) { fail++; console.log('  ✗ ' + msg) } }

function invariants(name, r) {
  const p = r.plan, T = p.truck
  const left = p.leftover.reduce((s, x) => s + x.count, 0)
  ok(p.placed.length + left === p.totalCount, `${name}: đặt ${p.placed.length} + thừa ${left} ≠ tổng ${p.totalCount}`)
  for (const b of p.placed) {
    if (b.x < -1 || b.y < -1 || b.z < -1 || b.x + b.l > T.length + 1 || b.y + b.w > T.width + 1 || b.z + b.h > T.height + 1) {
      ok(false, `${name}: thùng ra ngoài lòng xe`); break
    }
  }
  const ps = p.placed
  outer: for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j]
    if (a.x + a.l - 1 > b.x && b.x + b.l - 1 > a.x && a.y + a.w - 1 > b.y && b.y + b.w - 1 > a.y && a.z + a.h - 1 > b.z && b.z + b.h - 1 > a.z) {
      ok(false, `${name}: hai khối chồng lấn nhau`); break outer
    }
  }
  const sheet = r.count.reduce((s, c) => s + c.stacks.reduce((t, [n, l]) => t + n * l, 0), 0)
  ok(sheet === p.placed.length, `${name}: bảng đếm chân ${sheet} ≠ số đã xếp ${p.placed.length}`)
}

const items = Object.fromEntries(E.ADMIN_ITEMS.map(i => [i.id, i]))
const trucks = Object.fromEntries(E.ADMIN_VEHICLES.map(v => [v.id, v]))
const orderOf = o => ({ id: o.id, name: o.name, place: o.place, lines: o.lines.map(l => ({ item: items[l.itemId], qty: l.qty })) })
const sample = E.SAMPLE_ORDERS.map(orderOf)

const cases = [
  ['Chuyến mẫu · xe 5 tấn', trucks['adm-v-5t'], sample],
  ['Chuyến mẫu · xe 1,5 tấn (quá tải)', trucks['adm-v-1t5'], sample],
  ['Chuyến mẫu · xe pallet 8 tấn', trucks['adm-v-p8t'], sample],
  ['1 mã 1000 thùng · xe 15 tấn', trucks['adm-v-15t'], [{ id: 'x', name: 'Đơn X', place: '', lines: [{ item: items['adm-i-st110'], qty: 1000 }] }]],
  ['Toàn hàng nhẹ · xe pallet', trucks['adm-v-p15t'], [{ id: 'y', name: 'Đơn Y', place: '', lines: [{ item: items['adm-i-tui110'], qty: 50 }] }]],
]
for (const [name, truck, orders] of cases) {
  const t0 = performance.now()
  const r = E.computeTrip({ truck, orders, pallet: E.DEFAULT_PALLET_SETTINGS })
  const ms = Math.round(performance.now() - t0)
  invariants(name, r)
  const lines = r.count.map(c => `${c.label} [${c.orderName}] ${c.stacks.map(([n, l]) => `${n}×${l}`).join(' + ')} = ${c.placed}/${c.total} ${c.unit}${c.onTopOfOthers ? ' (trên nóc)' : ''}`)
  console.log(`• ${name} — ${ms} ms · vừa xe: ${r.fits} · ${r.plan.placedCount}/${r.plan.totalCount} · thể tích ${r.plan.volumePct.toFixed(1)}% · ${E.fmtKg(r.weightKg)} (${r.payloadPct?.toFixed(0)}% tải)${r.totals.pallets != null ? ` · ${r.totals.pallets} pallet` : ''}`)
  for (const l of lines) console.log('    ' + l)
  for (const w of [...r.errors, ...r.warnings]) console.log('    ! ' + w)
}
// Ca dự phòng: hàng nhẹ thùng to ở đơn xếp sau — phải xếp đủ (xe 5 tấn còn rộng)
{
  const big = { ...items['adm-i-tui110'], l: 500, w: 350, h: 300 }
  const os = sample.map(o => ({ ...o, lines: o.lines.map(l => (l.item.id === 'adm-i-tui110' ? { ...l, item: big } : l)) }))
  const r = E.computeTrip({ truck: trucks['adm-v-5t'], orders: os, pallet: E.DEFAULT_PALLET_SETTINGS })
  invariants('hàng nhẹ thùng to', r)
  ok(r.plan.placedCount === r.plan.totalCount, `hàng nhẹ thùng to: chỉ xếp ${r.plan.placedCount}/${r.plan.totalCount}`)
  ok(r.warnings.some(w => w.includes('Không đặt được lên trên')), 'hàng nhẹ thùng to: thiếu dòng nhắc đã xếp như hàng thường')
}
const t0 = performance.now()
const sug = E.suggestTruck(sample, E.DEFAULT_PALLET_SETTINGS, E.ADMIN_VEHICLES.filter(v => v.kind === 'loose'))
console.log(`• Gợi ý xe cho chuyến mẫu: ${sug} (${Math.round(performance.now() - t0)} ms)`)
console.log(fail ? `\n${fail} lỗi` : '\nXANH')
process.exit(fail ? 1 : 0)
