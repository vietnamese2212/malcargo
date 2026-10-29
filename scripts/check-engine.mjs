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
  // xe pallet: khối pallet nào cũng có ruột (lớp thùng thật) — lõi đổi cách chia lớp mà plan.ts không theo
  // thì ruột không khớp chiều cao, 3D lùi về khối quấn màng ⇒ phải báo ở đây
  const pal = r.meta.map((m, gi) => ({ m, g: p.groups[gi] })).filter(x => x.m.isPallet)
  if (pal.length && !r.errors.length) {
    const inPal = pal.reduce((s, x) => s + (x.m.layers ?? []).reduce((a, l) => a + l.n, 0) * x.g.count, 0)
    const loose = r.count.filter(c => c.unit === 'thùng').reduce((s, c) => s + c.total, 0)
    ok(pal.every(x => x.m.layers?.length) && inPal + loose === r.totals.cartons,
      `${name}: ruột pallet ${inPal} + thùng rời ${loose} ≠ ${r.totals.cartons} thùng (khối thiếu ruột: ${pal.filter(x => !x.m.layers).map(x => x.m.label).join(', ') || 'không'})`)
  }
  // DIỄN GIẢI TỪNG MÃ phải cộng đúng: thùng rời — phần đủ lớp + lẻ (chân thấp + nổi) = đã xếp; pallet — pallet chẵn + lẻ = tổng mã
  if (!r.errors.length && !pal.length) for (const n of E.explainLoose(r)) {
    const low = n.low.reduce((s, [k, l]) => s + k * l, 0)
    ok(n.fullCols * n.layers + n.rest === n.placed && n.rest === low + n.above && n.cols === n.fullCols + n.low.reduce((s, [k]) => s + k, 0),
      `${name}: diễn giải ${n.label} lệch — ${JSON.stringify(n)}`)
  }
  if (!r.errors.length && pal.length) {
    const ex = E.explainPallets(r)
    const sum = ex.items.reduce((s, n) => s + (n.full ? n.full.pallets * n.full.perPallet : 0) + n.rest.reduce((a, x) => a + x.n, 0), 0)
    ok(sum === r.totals.cartons && ex.items.every(n => n.total === (n.full ? n.full.pallets * n.full.perPallet : 0) + n.rest.reduce((a, x) => a + x.n, 0)),
      `${name}: diễn giải pallet cộng ${sum} ≠ ${r.totals.cartons} thùng`)
    ok(ex.mixes.every(x => x.levels.reduce((s, l) => s + l.times * l.parts.reduce((a, p) => a + p.n, 0), 0) === r.meta[x.group].cartons.length), `${name}: ruột pallet gộp diễn giải lệch`)
    // popup Diễn giải pallet (29/10): thẻ từng pallet — tổng thùng khớp chuyến, tổng pallet khớp số pallet đã tính
    const cards = E.explainPalletCards(r)
    const cs = cards.reduce((s, c) => s + c.count * c.parts.reduce((a, p) => a + p.n, 0), 0), ps = cards.reduce((s, c) => s + c.count, 0)
    ok(cs === r.totals.cartons && ps === r.totals.pallets && cards.every(c => (c.kind === 'mixed') === (c.parts.length > 1)),
      `${name}: thẻ pallet cộng ${cs} thùng / ${ps} pallet ≠ ${r.totals.cartons} / ${r.totals.pallets}`)
  }
}

const items = Object.fromEntries(E.ADMIN_ITEMS.map(i => [i.id, i]))
const trucks = Object.fromEntries(E.ADMIN_VEHICLES.map(v => [v.id, v]))
const orderOf = o => ({ id: o.id, name: o.name, place: o.place, lines: o.lines.map(l => ({ item: items[l.itemId], qty: l.qty })) })
// bộ đơn thử cố định = 2 đơn mẫu đời trước (xe 5 tấn) — các ca dưới đây đã chốt số trên bộ này
const sample = E.PREV_SAMPLES[0].orders.map(orderOf)

// chuyến mẫu hiện tại (29/10): xe pallet ra ĐÚNG 17 pallet (chẵn + gộp chung), phần lẻ thạch túi nằm trên cùng
// pallet gộp — bật "Hàng nhẹ: pallet riêng" thì đứng pallet riêng (18 pallet, vẫn vừa xe: công tắc phải thấy được
// khác biệt); container 40ft xếp rời gần đủ tải 28 tấn, hàng nhẹ trên nóc
for (const st of E.SAMPLE_TRIPS) {
  const os = st.orderIds.map(id => orderOf(E.SAMPLE_ORDERS.find(o => o.id === id)))
  const run = lightOwnPallet => E.computeTrip({ truck: trucks[st.vehicleId], orders: os, pallet: E.DEFAULT_PALLET_SETTINGS, lightOwnPallet })
  const r = run(false)
  invariants(st.name, r)
  ok(r.fits && !r.overweight && r.plan.placedCount === r.plan.totalCount, `${st.name}: không vừa xe`)
  if (trucks[st.vehicleId].kind === 'pallet') {
    const cards = E.explainPalletCards(r)
    const lightIn = rr => E.explainPalletCards(rr).filter(c => c.parts.some(p => os[0].lines.some(l => l.item.light && l.item.id === p.itemId)) && c.kind !== 'full')
    ok(r.totals.pallets === 17 && cards.some(c => c.kind === 'mixed') && lightIn(r).every(c => c.kind === 'mixed'),
      `${st.name}: ${r.totals.pallets} pallet (cần 17, có pallet gộp, thạch lẻ nằm trên pallet gộp)`)
    const on = run(true)
    invariants(st.name + ' · hàng nhẹ pallet riêng', on)
    ok(on.fits && on.totals.pallets === 18 && lightIn(on).every(c => c.kind === 'own'), `${st.name}: bật hàng nhẹ pallet riêng ⇒ ${on.totals.pallets} pallet (cần 18, thạch lẻ đứng riêng, vừa xe)`)
  } else {
    ok(r.count.some(c => c.onTopOfOthers && os.some(o => o.lines.some(l => l.item.light && l.item.name === c.label))), `${st.name}: hàng nhẹ không nằm trên nóc`)
    ok(r.payloadPct >= 90, `${st.name}: chở ${r.payloadPct?.toFixed(0)}% tải (cần ≥ 90% để thử được)`)
    // bốc xá TỚI SÁT CỬA (chủ dự án 29/10): khe ở cửa dưới 1,5 cạnh thùng — trước đó chừa ~0,7 m (khối cuối chồng 11 lớp)
    const gap = trucks[st.vehicleId].l - Math.max(...r.plan.placed.map(b => b.x + b.l))
    ok(gap < 380, `${st.name}: hàng tới sát cửa (khe ${gap} mm)`)
  }
  console.log(`• ${st.name} — ${r.plan.placedCount}/${r.plan.totalCount} · ${E.fmtKg(r.weightKg)} (${r.payloadPct?.toFixed(0)}% tải)${r.totals.pallets != null ? ` · ${r.totals.pallets} pallet` : ''}`)
}

// Chồng khi XẾP XÁ (`looseLayers`, chủ dự án 29/10: 110ml pallet 14 lớp, xá 28): xe thùng rời chồng theo số xá,
// chưa khai thì như pallet; xe pallet không đổi
{
  const base = { ...items['adm-i-st110'], looseLayers: null }
  const loose = lx => E.computeTrip({ truck: trucks['adm-v-5t'], orders: [{ id: 'x', name: 'Đơn X', place: '', lines: [{ item: { ...base, looseLayers: lx }, qty: 1800 }] }], pallet: E.DEFAULT_PALLET_SETTINGS })
  const top = r => Math.max(...r.count.flatMap(c => c.stacks.map(([, l]) => l)))
  const a = loose(null), b = loose(28)
  invariants('chồng xá 28', b)
  ok(top(a) <= 14 && top(b) > 14 && top(b) <= 20, `xe xá: chưa khai chồng xá ⇒ ≤ 14 lớp (${top(a)}); khai 28 ⇒ quá 14, ≤ 20 lớp vừa cao xe 2 m (${top(b)})`)
  const pal = lx => E.computeTrip({ truck: trucks['adm-v-p8t'], orders: [{ id: 'x', name: 'Đơn X', place: '', lines: [{ item: { ...base, looseLayers: lx }, qty: 500 }] }], pallet: E.DEFAULT_PALLET_SETTINGS })
  ok(JSON.stringify(pal(null).count) === JSON.stringify(pal(28).count), 'xe pallet: chồng xá không làm đổi pallet')
  console.log(`• Chồng xá — 1.800 thùng 110ml xe 5 tấn: như pallet ${top(a)} lớp · khai xá 28 ⇒ ${top(b)} lớp`)
}

const cases = [
  ['Chuyến mẫu · xe 5 tấn', trucks['adm-v-5t'], sample],
  ['Chuyến mẫu · xe 1,5 tấn (quá tải)', trucks['adm-v-1t5'], sample],
  ['Chuyến mẫu · xe pallet 8 tấn', trucks['adm-v-p8t'], sample],
  ['1 mã 1000 thùng · xe 15 tấn', trucks['adm-v-15t'], [{ id: 'x', name: 'Đơn X', place: '', lines: [{ item: items['adm-i-st110'], qty: 1000 }] }]],
  ['Toàn hàng nhẹ · xe pallet', trucks['adm-v-p15t'], [{ id: 'y', name: 'Đơn Y', place: '', lines: [{ item: items['adm-i-tui110'], qty: 50 }] }]],
  ['Chuyến mẫu · Container 20ft', trucks['adm-v-c20'], sample],
  ['Chuyến mẫu ×4 · Container 40ft chở pallet', { ...trucks['adm-v-c40'], kind: 'pallet' }, sample.map(o => ({ ...o, lines: o.lines.map(l => ({ ...l, qty: l.qty * 4 })) }))],
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
// Hàng nhẹ thùng TO hơn thùng nền, ở đơn xếp sau — phải xếp đủ (xe 5 tấn còn rộng). Từ 27/10
// lõi tự lát phẳng được lên nóc (levelFill) nên không cần lớp dự phòng của plan.ts nữa.
{
  const big = { ...items['adm-i-tui110'], l: 500, w: 350, h: 300 }
  const os = sample.map(o => ({ ...o, lines: o.lines.map(l => (l.item.id === 'adm-i-tui110' ? { ...l, item: big } : l)) }))
  const r = E.computeTrip({ truck: trucks['adm-v-5t'], orders: os, pallet: E.DEFAULT_PALLET_SETTINGS })
  invariants('hàng nhẹ thùng to', r)
  ok(r.plan.placedCount === r.plan.totalCount, `hàng nhẹ thùng to: chỉ xếp ${r.plan.placedCount}/${r.plan.totalCount}`)
}
// Xe pallet (user 28/10): mọi hàng NẰM GỌN trên pallet của nó (không thùng rời vắt qua pallet), có KHE giữa
// các pallet; pallet chẵn = quy cách ÷ số lớp thùng/lớp, KHÔNG quá số lớp khai ("110 thùng – 11 lớp ⇒ 1 lớp
// 10 thùng"; ảnh: Sữa 180 thành 13 lớp vượt quy định); phần lẻ MỖI MÃ nằm nguyên MỘT pallet ("100 thùng,
// quy cách 110 mà không lên 1 pallet?"), dồn pallet gộp ≤ 1,65m, hàng NHẸ TRÊN CÙNG; chuyến bật "Hàng nhẹ:
// pallet riêng" ⇒ phần lẻ hàng nhẹ đứng pallet riêng.
{
  const tui = items['adm-i-tui110']
  const P = E.DEFAULT_PALLET_SETTINGS
  const os = [{ id: 'z', name: 'Đơn Z', place: '', lines: [
    { item: items['adm-i-scu180'], qty: 110 }, { item: items['adm-i-c100'], qty: 200 }, { item: tui, qty: 200 },
  ] }]
  const lightIds = new Set(E.ADMIN_ITEMS.filter(i => i.light).map(i => i.id))
  const palletChecks = (name, r) => {
    invariants(name, r)
    ok(r.fits && r.count.every(c => c.unit === 'pallet'), `${name}: phải toàn pallet và vừa xe, được ${JSON.stringify(r.count.map(c => [c.label, c.unit, c.placed]))}`)
    const remOn = new Map()   // mã → số pallet KHÔNG chẵn đang chứa nó
    for (const [gi, m] of r.meta.entries()) {
      const g = r.plan.groups[gi], cs = m.cartons ?? [], d = m.deck
      // thùng trong khối; khối = chân + phần chờm, chờm mỗi bên ≤ 60mm
      ok(d && cs.every(c => c.x >= -0.5 && c.y >= -0.5 && c.x + c.l <= g.l + 0.5 && c.y + c.w <= g.w + 0.5)
        && Math.max(d.x, d.y, g.l - d.x - d.l, g.w - d.y - d.w) <= 60, `${name}: ${m.label} có thùng ra ngoài khối pallet / chờm quá 60mm`)
      // đủ thùng (không rơi thùng nào khi xếp lớp) + CHỖ ĐỠ (user 28/10: "phía dưới phải phủ hết"): thùng không nằm
      // sát mặt pallet được đỡ ≥ 70% đáy, hoặc ≥ 50% mà trọng tâm nằm trên thùng dưới (mẫu chờm mép); hàng nhẹ gác qua
      // khe lớp ghép ≥ 30% (thùng dưới thấp hơn ≤ 35mm vẫn tính — lớp trộn thùng cao 130 / 100)
      ok(cs.length === (m.layers ?? []).reduce((s, l) => s + l.n, 0), `${name}: ${m.label} xếp ${cs.length} thùng ≠ ruột ${(m.layers ?? []).reduce((s, l) => s + l.n, 0)}`)
      const under = c => cs.filter(d => d.z < c.z && d.z + d.h <= c.z + 1 && d.z + d.h >= c.z - 36)
      const weak = cs.filter(c => c.z >= 1).map(c => {
        let s = 0
        for (const d of under(c)) s += Math.max(0, Math.min(c.x + c.l, d.x + d.l) - Math.max(c.x, d.x)) * Math.max(0, Math.min(c.y + c.w, d.y + d.w) - Math.max(c.y, d.y))
        const cx = c.x + c.l / 2, cy = c.y + c.w / 2
        return { c, s: s / (c.l * c.w), cog: under(c).some(d => cx > d.x && cx < d.x + d.l && cy > d.y && cy < d.y + d.w) }
      }).filter(x => (lightIds.has(x.c.itemId) ? x.s < 0.3 : x.s < 0.5 || (x.s < 0.7 && !x.cog)))
      ok(!weak.length, `${name}: ${m.label} có ${weak.length} thùng đỡ kém (vd ${weak[0] && `${weak[0].c.itemId} z${weak[0].c.z} ${Math.round(weak[0].s * 100)}%`})`)
      // SỐ LỚP (user 28/10 tối: thạch túi chồng thành tháp 11 lớp, "sai nguyên tắc số lớp"): không nhiều lớp hơn lõi
      // tính; mỗi cột thùng CÙNG MÃ không quá số lớp tối đa của mã; không cao quá trần pallet; khối cao đúng đỉnh thùng
      const zs = [...new Set(cs.map(c => c.z))].sort((a, b) => a - b)
      if (cs.length) {
        ok(zs.length <= (m.layers ?? []).length, `${name}: ${m.label} xếp ${zs.length} lớp > ${(m.layers ?? []).length} lớp lõi tính (tháp)`)
        const k = new Map()
        for (const z of zs) for (const c of cs.filter(c => c.z === z)) k.set(c, 1 + Math.max(0, ...under(c).filter(d => d.itemId === c.itemId && Math.min(c.x + c.l, d.x + d.l) > Math.max(c.x, d.x) && Math.min(c.y + c.w, d.y + d.w) > Math.max(c.y, d.y)).map(d => k.get(d))))
        const over = cs.find(c => items[c.itemId].maxLayers && k.get(c) > items[c.itemId].maxLayers)
        ok(!over, `${name}: ${m.label} có cột ${over && items[over.itemId].name} chồng ${over && k.get(over)} lớp > ${over && items[over.itemId].maxLayers}`)
        const top = Math.max(...cs.map(c => c.z + c.h))
        ok(top <= P.maxH - P.baseH + 0.5 && Math.abs(g.h - P.baseH - top) < 0.5, `${name}: ${m.label} đỉnh thùng ${top} (trần ${P.maxH - P.baseH}), khối cao ${g.h}`)
      }
      const it = m.itemId ? items[m.itemId] : null
      if (it && cs.length === it.perPallet) {
        const per = Math.ceil(it.perPallet / it.maxLayers), top = Math.max(...cs.map(c => c.z + c.h))
        ok(top <= it.maxLayers * it.h + 0.5 && cs.filter(c => c.z < 1).length === per,
          `${name}: ${m.label} pallet chẵn phải ${per} thùng/lớp, ≤ ${it.maxLayers} lớp — được ${cs.filter(c => c.z < 1).length}/lớp, cao ${top}`)
      } else for (const id of new Set(cs.map(c => c.itemId))) remOn.set(`${m.orderName}|${id}`, (remOn.get(`${m.orderName}|${id}`) ?? 0) + 1)
      let lap = 0, heavyOnLight = 0
      for (let i = 0; i < cs.length; i++) for (let j = 0; j < cs.length; j++) {
        if (i === j) continue
        const a = cs[i], b = cs[j]
        const xy = a.x + a.l - 1 > b.x && b.x + b.l - 1 > a.x && a.y + a.w - 1 > b.y && b.y + b.w - 1 > a.y
        if (i < j && xy && a.z + a.h - 1 > b.z && b.z + b.h - 1 > a.z) lap++
        if (xy && !lightIds.has(a.itemId) && lightIds.has(b.itemId) && a.z >= b.z + b.h - 1) heavyOnLight++
      }
      ok(!lap, `${name}: ${m.label} có ${lap} cặp thùng chồng lấn`)
      ok(!heavyOnLight, `${name}: ${m.label} có ${heavyOnLight} thùng hàng thường nằm TRÊN hàng nhẹ`)
      if (m.mix) ok(r.plan.groups[gi].h <= P.maxH + 0.5, `${name}: ${m.label} cao ${r.plan.groups[gi].h} > ${P.maxH}`)
    }
    for (const [k, n] of remOn) ok(n === 1, `${name}: phần lẻ ${k} vắt qua ${n} pallet`)
    const ps = r.plan.placed
    // làn nào có từ 2 pallet thì giữa chúng phải có khe
    const sameLane = ps.some(a => ps.some(b => b !== a && b.x > a.x && Math.abs(b.y - a.y) < 1))
    if (sameLane) ok(ps.some(a => ps.some(b => b !== a && b.x >= a.x + a.l + 1 && Math.abs(b.y - a.y) < 1)), `${name}: các pallet trong làn phải có khe`)
  }
  const show = r => r.count.map(c => `${c.label}${c.mix ? ' [' + c.mix.map(x => x.n + ' ' + x.label).join(' + ') + ']' : ''}`).join(' · ')
  // Ca ảnh chủ dự án 28/10: chuyến mẫu, xe 5 tấn đổi sang chở pallet
  const s = E.computeTrip({ truck: { ...trucks['adm-v-5t'], kind: 'pallet' }, orders: sample, pallet: P })
  palletChecks('pallet · chuyến mẫu xe 5 tấn', s)
  ok(s.meta.some(m => m.mix?.some(x => x.itemId === tui.id)), 'pallet · chuyến mẫu: thạch túi phải dồn lên pallet gộp phần lẻ')
  console.log(`• Pallet · chuyến mẫu xe 5 tấn — ${show(s)}`)
  // Ảnh chủ dự án 28/10: Sữa chua chai 144 = pallet chẵn 143 + 1 thùng thừa dồn lên pallet lẻ (Sữa chua 180) —
  // thùng thừa phải nằm GỌN giữa mặt, không ra góc chờm mép theo mẫu 11 thùng/lớp (nhìn như gác lên pallet bên)
  {
    const os144 = sample.map(o => ({ ...o, lines: o.lines.map(l => (l.item.id === 'adm-i-c100' ? { ...l, qty: 144 } : l)) }))
    const r = E.computeTrip({ truck: { ...trucks['adm-v-5t'], kind: 'pallet' }, orders: os144, pallet: P })
    palletChecks('pallet · thùng thừa 144', r)
    const gi = r.meta.findIndex(m => m.mix?.some(x => x.itemId === 'adm-i-c100' && x.n === 1))
    const m = r.meta[gi], d = m?.deck, c = m?.cartons.find(x => x.itemId === 'adm-i-c100')
    ok(c && d.x === 0 && d.y === 0 && c.x >= d.x && c.x + c.l <= d.x + d.l && c.y >= d.y && c.y + c.w <= d.y + d.w
      && Math.abs(c.x + c.l / 2 - (d.x + d.l / 2)) < 60 && Math.abs(c.y + c.w / 2 - (d.y + d.w / 2)) < 60,
      `pallet · thùng thừa 144: thùng thừa phải nằm giữa mặt pallet lẻ, gọn trong chân — được ${JSON.stringify({ c, d })}`)
  }
  // Ảnh chủ dự án 28/10: phần lẻ nhỏ của 2 mã nặng + nhiều thạch túi — lớp dưới phải phủ kín (lớp hỗn hợp nhiều mã),
  // thạch túi không chồng lên ô trống / bậc so le
  for (const [nm, ls] of [['5 Sữa 180 + 7 Sữa 110 + 150 túi', [['adm-i-st180', 115], ['adm-i-st110', 147], ['adm-i-tui110', 150]]],
    ['13 Sữa 180 + 20 Sữa chua chai + 60 túi', [['adm-i-st180', 13], ['adm-i-c100', 20], ['adm-i-tui110', 60]]],
    ['9 Sữa thạch + 17 Sữa chai + 100 túi', [['adm-i-th170', 9], ['adm-i-c85', 17], ['adm-i-tui110', 100]]]]) {
    const r = E.computeTrip({ truck: trucks['adm-v-p8t'], orders: [{ id: 'm', name: 'Đơn M', place: '', lines: ls.map(([id, qty]) => ({ item: items[id], qty })) }], pallet: P })
    palletChecks(`pallet · lớp phủ kín · ${nm}`, r)
    const mx = r.meta.find(m => m.mix)
    const bottom = mx ? mx.cartons.filter(c => c.z < 1).reduce((s, c) => s + c.l * c.w, 0) / (P.l * P.w) : 0
    ok(bottom >= 0.85, `pallet · lớp phủ kín · ${nm}: lớp đáy pallet gộp chỉ phủ ${Math.round(bottom * 100)}% mặt pallet`)
  }
  // Ảnh chủ dự án 28/10 tối: phần lẻ hàng thường chỉ vài thùng + gần đủ pallet thạch túi (8 lớp) — trước đây thạch
  // chồng 9-11 lớp thành tháp đỉnh lởm chởm; nay lớp đủ 27 thùng, cột thạch ≤ 8 lớp (palletChecks đo)
  for (const [nm, q] of [['Sữa 110 lẻ 5 + 190 túi', { 'adm-i-st110': 145, 'adm-i-tui110': 190 }], ['Sữa 110 lẻ 8 + 160 túi', { 'adm-i-st110': 148, 'adm-i-tui110': 160 }],
    ['Sữa 180 lẻ 2 + Sữa 110 lẻ 8 + 180 túi', { 'adm-i-st180': 112, 'adm-i-st110': 148, 'adm-i-tui110': 180 }], ['vừa trần 1,65m', { 'adm-i-st180': 150, 'adm-i-st110': 158, 'adm-i-tui110': 160 }]]) {
    const o = sample.map(x => ({ ...x, lines: x.lines.map(l => ({ ...l, qty: q[l.item.id] ?? (l.item.id === 'adm-i-c100' ? 144 : l.item.id === 'adm-i-scu180' ? 110 : l.qty) })) }))
    palletChecks(`pallet · thạch không thành tháp · ${nm}`, E.computeTrip({ truck: { ...trucks['adm-v-5t'], kind: 'pallet', payloadKg: 9000 }, orders: o, pallet: P }))
  }
  const a = E.computeTrip({ truck: trucks['adm-v-p8t'], orders: os, pallet: P })
  palletChecks('pallet · phần lẻ dồn', a)
  ok(a.count.some(c => a.meta[c.group].itemId === items['adm-i-c100'].id && a.meta[c.group].cartons?.length === 143), 'pallet · phần lẻ dồn: Sữa chua chai phải có 1 pallet chẵn 143 thùng')
  console.log(`• Pallet · phần lẻ dồn (xe pallet 8 tấn) — ${show(a)}`)
  const b = E.computeTrip({ truck: trucks['adm-v-p8t'], orders: os, pallet: P, lightOwnPallet: true })
  palletChecks('pallet · nhẹ pallet riêng', b)
  ok(b.meta.filter(m => m.cartons?.some(c => c.itemId === tui.id)).every(m => m.cartons.every(c => c.itemId === tui.id)), 'pallet · nhẹ pallet riêng: pallet chứa thạch túi chỉ có thạch túi')
  console.log(`• Pallet · nhẹ pallet riêng — ${b.count.map(c => c.label).join(' · ')}`)
  ok(E.suggestTruck(os, P, E.ADMIN_VEHICLES.filter(v => v.kind === 'pallet'), true) === 'adm-v-p8t', 'pallet: gợi ý xe phải là xe pallet 8 tấn')
}
// Xe tự chọn / gợi ý (chủ dự án 28/10: Container 20ft nhỏ hơn xe 8 tấn nên bị tự chọn): chưa có xe / đang xe tải ⇒
// chỉ xe tải; đang container ⇒ chỉ container
{
  const V = E.ADMIN_VEHICLES, big = sample.map(o => ({ ...o, lines: o.lines.map(l => ({ ...l, qty: l.qty * 2 })) }))
  for (const cur of [undefined, trucks['adm-v-5t'], trucks['adm-v-c40']]) {
    const pool = E.pickPool(V, cur)
    ok(pool.length && pool.every(v => !!v.container === !!cur?.container && v.kind === (cur?.kind ?? 'loose')), `xe tự chọn khi đang ${cur?.name ?? 'chưa có xe'}: ${pool.map(v => v.name).join(', ')}`)
  }
  const s = E.suggestTruck(big, E.DEFAULT_PALLET_SETTINGS, E.pickPool(V, undefined))
  ok(s && !trucks[s].container, `gợi ý xe cho hàng gấp đôi chuyến mẫu phải là xe tải, được ${s}`)
  console.log(`• Gợi ý xe cho hàng gấp đôi chuyến mẫu: ${s} (mọi xe: ${E.suggestTruck(big, E.DEFAULT_PALLET_SETTINGS, V.filter(v => v.kind === 'loose'))})`)
}
// Mã chưa khai thùng/pallet trên xe pallet (thử 29/10: 2.000 thùng ra "1 pallet · vừa xe") ⇒ ước theo cỡ thùng:
// 600×400 gọn 5 thùng/lớp trên chân 1200×1000, cao 400 ⇒ 3 lớp dưới trần 1,65 m ⇒ 15 thùng/pallet
{
  const it = { id: 'np', owner: 'me', code: 'NP', name: 'Hàng A', l: 600, w: 400, h: 400, kg: null, perPallet: null, maxLayers: null, light: false, updatedAt: 0 }
  const run = qty => E.computeTrip({ truck: trucks['adm-v-p8t'], orders: [{ id: 'o', name: 'Đơn 1', place: '', lines: [{ item: it, qty }] }], pallet: E.DEFAULT_PALLET_SETTINGS })
  const big = run(2000), small = run(40)
  ok(big.totals.pallets === 134 && !big.fits, `chưa khai thùng/pallet: 2.000 thùng phải ra 134 pallet, không vừa xe (được ${big.totals.pallets}, vừa ${big.fits})`)
  ok(small.totals.pallets === 3 && small.fits && small.plan.placedCount === 3, `chưa khai thùng/pallet: 40 thùng phải ra 3 pallet (được ${small.totals.pallets})`)
  ok(big.warnings.some(w => w.includes('ước theo cỡ thùng')), 'chưa khai thùng/pallet: có cảnh báo "đang ước theo cỡ thùng"')
  console.log(`• Chưa khai thùng/pallet: 2.000 thùng → ${big.totals.pallets} pallet · 40 thùng → ${small.totals.pallets} pallet`)
}
const t0 = performance.now()
const sug = E.suggestTruck(sample, E.DEFAULT_PALLET_SETTINGS, E.pickPool(E.ADMIN_VEHICLES, undefined))
console.log(`• Gợi ý xe cho chuyến mẫu: ${sug} (${Math.round(performance.now() - t0)} ms)`)
console.log(fail ? `\n${fail} lỗi` : '\nXANH')
process.exit(fail ? 1 : 0)
