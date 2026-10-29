// DIỄN GIẢI TỪNG MÃ — popup BẢNG mở từ nút trên khung 3D (chủ dự án 28/10: "xếp khối như vậy thì cao bao nhiêu, lẻ
// bao nhiêu của từng mã — người làm tính được ngay từ lúc chưa lên hàng, không cần bước trước bước sau"; "đưa diễn
// giải dạng table, bấm ở trên màn hình 3D thì ra popup"). Xe thùng rời: khối mấy chân × mấy lớp, cao, dọc xe, lẻ
// (chân thấp / thùng nổi trên mặt). Xe pallet: mấy pallet chẵn (thùng/lớp × lớp, cao), lẻ bao nhiêu nằm pallet nào
// lớp thứ mấy; ruột từng pallet gộp từ dưới lên. Số lấy từ sơ đồ đã tính (`engine/explain.ts`).
import type { ReactNode } from 'react'
import { ClipboardCopy } from 'lucide-react'
import type { Item, Vehicle } from '../data/types'
import type { TripResult } from '../engine/plan'
import { explainLoose, explainPallets, type LooseNote, type MixNote, type PalletItemNote } from '../engine/explain'
import { tint } from '../three/colors'
import { Button, Sheet, cx, fmtDec, fmtInt } from '../ui/kit'
import { t, tx } from '../i18n'

const m = (mm: number) => `${fmtDec(mm / 1000, 2)} m`
const span = (a: number, b: number) => (a === b ? fmtInt(a) : `${fmtInt(a)}–${fmtInt(b)}`)

// ── chữ chép gửi Zalo (dòng, không bảng) ──
function looseLines(n: LooseNote): string[] {
  const out: string[] = []
  if (n.placed) {
    out.push(t('Khối {n} chân × {l} lớp = {c} thùng', { n: n.fullCols, l: n.layers, c: fmtInt(n.fullCols * n.layers) }))
    out.push(t('Cao {h} · chiếm {len} dọc xe', { h: m(n.bodyMm), len: m(n.lenMm) }))
    out.push(!n.rest ? t('Không lẻ') : restLine(n))
    if (n.onTop) out.push(t('Trên nóc hàng khác · đỉnh cách sàn {h}', { h: m(n.topMm) }))
  }
  if (n.placed < n.total) out.push(t('Chưa lên xe {n} thùng', { n: n.total - n.placed }))
  return out
}
const restLine = (n: LooseNote) => (n.low.length ? t('Lẻ {n} thùng: {list}', { n: n.rest, list: restParts(n).join(' + ') })
  : t('Lẻ {n} thùng nổi trên mặt khối (lớp {l})', { n: n.rest, l: aboveSpan(n) }))
const aboveSpan = (n: LooseNote) => span(n.layers + 1, n.layers + n.aboveLayers)
const restParts = (n: LooseNote) => [
  ...n.low.map(([k, l]) => t('{n} chân × {l} lớp', { n: k, l })),
  ...(n.above ? [t('{n} thùng nổi (lớp {l})', { n: n.above, l: aboveSpan(n) })] : []),
]
const posOf = (r: PalletItemNote['rest'][number]) => (r.from === 1 ? t('dưới cùng') : r.to === r.of ? t('trên cùng') : t('giữa'))
const restWhere = (r: PalletItemNote['rest'][number]) => (!r.mixed ? t('Lẻ {n} thùng → pallet riêng: {l} lớp · cao {h}', { n: r.n, l: r.of, h: m(r.heightMm) })
  : t('Lẻ {n} thùng → {name}: lớp {range} / {of} ({pos})', { n: r.n, name: tx(r.label), range: span(r.from, r.to), of: r.of, pos: posOf(r) }))
function palletLines(n: PalletItemNote): string[] {
  const out: string[] = []
  const f = n.full
  if (f) {
    out.push(t('{p} pallet chẵn: {per} thùng/lớp × {l} lớp = {n} thùng · cao {h}', { p: f.pallets, per: f.perLayer, l: f.layers, n: fmtInt(f.perPallet), h: m(f.heightMm) }))
    if (f.left) out.push(t('{n} pallet chưa lên xe', { n: f.left }))
  }
  out.push(...n.rest.map(restWhere))
  if (!n.rest.length) out.push(t('Không lẻ'))
  return out
}
// các bậc lớp của pallet gộp kèm số thứ tự lớp (từ dưới lên)
const mixRows = (x: MixNote) => {
  let at = 0
  return x.levels.map(lv => { const from = at + 1; at += lv.times; return { ...lv, from, to: at } })
}
function mixLines(x: MixNote, nameOf: (id: string) => string): string[] {
  return x.levels.map(lv => {
    if (lv.parts.length > 1) return t('{t} lớp ghép: {list}', { t: lv.times, list: lv.parts.map(p => `${fmtInt(p.n)} ${nameOf(p.itemId)}`).join(' + ') })
    const p = lv.parts[0]
    return lv.full ? t('{t} lớp {name} · {n} thùng/lớp', { t: lv.times, name: nameOf(p.itemId), n: p.n })
      : t('{t} lớp {name} · {n} thùng (chưa đủ lớp)', { t: lv.times, name: nameOf(p.itemId), n: p.n })
  })
}

// ── bảng ──
const TH = 'whitespace-nowrap px-2 py-2 text-left text-[12px] font-semibold text-slate-600 first:pl-0 last:pr-0'
const TD = 'px-2 py-2.5 align-top first:pl-0 last:pr-0'
// số dính với đơn vị đi sau ("0,86 m", "112 thùng") — xuống dòng không bẻ giữa cụm
const glue = (s: ReactNode) => (typeof s === 'string' ? s.replace(/(\d) (?=[^\s\d=·+→/×(])/g, '$1 ') : s)
const Sub = ({ children, warn, className }: { children: ReactNode; warn?: boolean; className?: string }) =>
  <span className={cx('mt-0.5 block text-[12px] leading-snug', warn ? 'font-medium text-red-700' : 'text-slate-600', className)}>{glue(children)}</span>
const Num = ({ children }: { children: ReactNode }) => <span className="num block whitespace-nowrap text-sm font-semibold text-slate-900">{children}</span>
// cột tên mã đứng yên khi kéo ngang bảng
const NAME_COL = 'sticky left-0 z-[1] bg-white'
// điện thoại: bỏ cột phụ (cao, dọc xe, lẻ nằm ở) — số của nó hiện thành dòng nhỏ trong ô bên cạnh, câu "lẻ nằm đâu"
// thành một dòng riêng trải hết bề ngang dưới mã — khỏi kéo ngang, khỏi vỡ chữ trong cột hẹp
const WIDE = 'max-sm:hidden', NARROW = 'sm:hidden'

function Table({ head, children, minW }: { head: (string | [string, string])[]; children: ReactNode; minW?: string }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className={cx('w-full border-collapse', minW)}>
        <thead><tr className="border-b border-slate-300">{head.map((h, i) => <th key={i} className={cx(TH, i === 0 && NAME_COL, Array.isArray(h) && h[1])}>{Array.isArray(h) ? h[0] : h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
/** Một dòng bảng + (điện thoại) dòng giải thích phần lẻ ngay dưới, trải hết bề ngang. */
function Row({ first, children, detail }: { first: boolean; children: ReactNode; detail: string[] }) {
  return <>
    <tr className={cx(!first && 'border-t border-slate-100')}>{children}</tr>
    {detail.length > 0 && (
      <tr className={NARROW}><td colSpan={5} className="pb-2.5 pl-[22px]">{detail.map((d, i) => <Sub key={i} className="!mt-0 text-slate-800">{d}</Sub>)}</td></tr>
    )}
  </>
}
function NameCell({ color, name, sub }: { color: string; name: string; sub: ReactNode }) {
  return (
    <td className={cx(TD, NAME_COL, 'w-[44%] sm:w-[34%] sm:min-w-[150px]')}>
      <span className="flex items-start gap-2">
        <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-sm border border-black/20" style={{ background: color }} />
        <span className="min-w-0">
          <span className="block break-words text-sm font-semibold leading-snug text-slate-900">{name}</span>
          <Sub>{sub}</Sub>
        </span>
      </span>
    </td>
  )
}

export function ExplainPopup({ open, onClose, r, vehicle, items, colors, tripName, onToast }: {
  open: boolean; onClose: () => void; r: TripResult | null; vehicle?: Vehicle; items: Item[]; colors: Map<string, string>
  tripName: string; onToast: (s: string) => void
}) {
  if (!open || !r || !vehicle) return null
  const nameOf = (id: string | null, fallback = '') => tx(items.find(i => i.id === id)?.name ?? fallback)
  const colorOf = (id: string | null) => tint(colors.get(id ?? '') ?? '#7d8794')
  const pallet = vehicle.kind === 'pallet'
  const loose = pallet ? [] : explainLoose(r)
  const pal = pallet ? explainPallets(r) : { items: [], mixes: [] }
  const multiOrder = new Set((pallet ? pal.items : loose).map(x => x.orderId)).size > 1
  const who = (order: string, total: number) => [multiOrder ? tx(order) : null, t('{n} thùng', { n: fmtInt(total) })].filter(Boolean).join(' · ')

  const copy = async () => {
    const rows = pallet ? pal.items.map(n => ({ name: nameOf(n.itemId, n.label), order: n.orderName, total: t('{n} thùng', { n: fmtInt(n.total) }), lines: palletLines(n) }))
      : loose.map(n => ({ name: nameOf(n.itemId, n.label), order: n.orderName, total: t('{n} thùng', { n: fmtInt(n.total) }), lines: looseLines(n) }))
    const text = [
      `${tx(tripName)} — ${tx(vehicle.name)}${vehicle.plate ? ` (${vehicle.plate})` : ''}`,
      t('Diễn giải từng mã:'),
      ...rows.flatMap(x => [`• ${x.name}${multiOrder ? ` [${tx(x.order)}]` : ''} — ${x.total}`, ...x.lines.map(l => `   ${l}`)]),
      ...(pal.mixes.length ? [t('Pallet gộp (từ dưới lên):'), ...pal.mixes.flatMap(x => [`• ${tx(x.label)} [${tx(x.orderName)}] — ${t('cao {h}', { h: m(x.heightMm) })}`, ...mixLines(x, id => nameOf(id)).map(s => `   ${s}`)])] : []),
    ]
    try { await navigator.clipboard.writeText(text.join('\n')); onToast(t('Đã chép diễn giải')) }
    catch { onToast(t('Trình duyệt chặn chép, hãy chụp màn hình')) }
  }

  return (
    <Sheet open onClose={onClose} wide="table" title={t('Diễn giải từng mã')} subtitle={t('Cao bao nhiêu, lẻ bao nhiêu — tính trước khi lên hàng')}
      footer={<div className="flex gap-2">
        <Button className="flex-1" onClick={onClose}>{t('Đóng')}</Button>
        <Button variant="primary" className="flex-[2]" onClick={copy}><ClipboardCopy size={17} />{t('Chép để gửi Zalo')}</Button>
      </div>}>
      {!pallet ? (
        <Table head={[t('Mã hàng'), t('Khối hàng'), [t('Cao'), WIDE], [t('Dọc xe'), WIDE], t('Lẻ')]} minW="sm:min-w-[520px]">
          {loose.map((n, i) => (
            <Row key={n.group} first={i === 0} detail={n.rest ? [restLine(n)] : []}>
              <NameCell color={colorOf(n.itemId)} name={nameOf(n.itemId, n.label)} sub={who(n.orderName, n.total)} />
              <td className={TD}>
                {n.placed ? <><Num>{t('{n} chân × {l} lớp', { n: n.fullCols, l: n.layers })}</Num><Sub>{t('= {n} thùng', { n: fmtInt(n.fullCols * n.layers) })}</Sub>
                  <Sub className={NARROW}>{t('Cao {h} · chiếm {len} dọc xe', { h: m(n.bodyMm), len: m(n.lenMm) })}</Sub>
                  {n.onTop && <Sub className={NARROW}>{t('trên nóc hàng khác · đỉnh {h}', { h: m(n.topMm) })}</Sub>}</> : <Num>—</Num>}
              </td>
              <td className={cx(TD, WIDE)}>
                <Num>{n.placed ? m(n.bodyMm) : '—'}</Num>
                {n.onTop && <Sub>{t('trên nóc hàng khác · đỉnh {h}', { h: m(n.topMm) })}</Sub>}
              </td>
              <td className={cx(TD, WIDE)}><Num>{n.placed ? m(n.lenMm) : '—'}</Num></td>
              <td className={TD}>
                <Num>{n.rest ? fmtInt(n.rest) : '—'}</Num>
                {n.rest > 0 && <Sub className={WIDE}>{n.low.length ? restParts(n).join(' + ') : t('nổi trên mặt khối, lớp {l}', { l: aboveSpan(n) })}</Sub>}
                {n.placed < n.total && <Sub warn>{t('Chưa lên xe {n} thùng', { n: n.total - n.placed })}</Sub>}
              </td>
            </Row>
          ))}
        </Table>
      ) : <>
        <Table head={[t('Mã hàng'), t('Pallet chẵn'), [t('Cao'), WIDE], t('Lẻ'), [t('Lẻ nằm ở'), WIDE]]} minW="sm:min-w-[600px]">
          {pal.items.map((n, i) => (
            <Row key={`${n.orderId}|${n.itemId}`} first={i === 0} detail={n.rest.map(restWhere)}>
              <NameCell color={colorOf(n.itemId)} name={nameOf(n.itemId, n.label)} sub={who(n.orderName, n.total)} />
              <td className={TD}>
                {n.full ? <><Num>{t('{p} × {n} thùng', { p: n.full.pallets, n: fmtInt(n.full.perPallet) })}</Num>
                  <Sub>{t('{per} thùng/lớp × {l} lớp', { per: n.full.perLayer, l: n.full.layers })}</Sub>
                  <Sub className={NARROW}>{t('cao {h}', { h: m(n.full.heightMm) })}</Sub>
                  {n.full.left > 0 && <Sub warn>{t('{n} pallet chưa lên xe', { n: n.full.left })}</Sub>}</> : <Num>—</Num>}
              </td>
              <td className={cx(TD, WIDE)}><Num>{n.full ? m(n.full.heightMm) : '—'}</Num></td>
              <td className={TD}><Num>{n.rest.length ? fmtInt(n.rest.reduce((s, x) => s + x.n, 0)) : '—'}</Num></td>
              <td className={cx(TD, WIDE)}>
                {n.rest.length ? n.rest.map(x => (
                  <span key={x.group} className="block">
                    <span className="block break-words text-sm font-medium leading-snug text-slate-900">{x.mixed ? tx(x.label) : t('Pallet riêng')}</span>
                    <Sub>{x.mixed ? t('lớp {range} / {of} · {pos}', { range: span(x.from, x.to), of: x.of, pos: posOf(x) }) : t('{l} lớp · cao {h}', { l: x.of, h: m(x.heightMm) })}</Sub>
                  </span>
                )) : <Num>—</Num>}
              </td>
            </Row>
          ))}
        </Table>
        {pal.mixes.map(x => (
          <section key={x.group} className="mt-6">
            <h3 className="flex flex-wrap items-baseline justify-between gap-x-3 text-[15px] font-semibold text-slate-900">
              <span className="break-words">{tx(x.label)}{multiOrder && <span className="font-normal text-slate-600"> · {tx(x.orderName)}</span>}</span>
              <span className="num whitespace-nowrap text-sm">{t('cao {h}', { h: m(x.heightMm) })}</span>
            </h3>
            <p className="mb-1 text-[12px] text-slate-600">{t('Xếp từ dưới lên')}</p>
            <Table head={[t('Lớp'), t('Mã hàng'), t('Thùng')]}>
              {mixRows(x).map(lv => (
                <tr key={lv.from}>
                  <td className={cx(TD, NAME_COL, 'w-16')}><Num>{span(lv.from, lv.to)}</Num></td>
                  <td className={TD}>
                    {lv.parts.map(p => (
                      <span key={p.itemId} className="flex items-start gap-2">
                        <span className="mt-1 h-3 w-3 shrink-0 rounded-sm border border-black/20" style={{ background: colorOf(p.itemId) }} />
                        <span className="break-words text-sm leading-snug text-slate-900">{nameOf(p.itemId)}{lv.parts.length > 1 && <span className="num text-slate-600"> · {fmtInt(p.n)}</span>}</span>
                      </span>
                    ))}
                  </td>
                  <td className={TD}>
                    <Num>{lv.parts.length === 1 && lv.full ? t('{n} thùng/lớp', { n: lv.parts[0].n }) : t('{n} thùng', { n: fmtInt(lv.parts.reduce((s, p) => s + p.n, 0)) })}</Num>
                    {lv.parts.length > 1 ? <Sub>{t('lớp ghép')}</Sub> : !lv.full && <Sub>{t('chưa đủ lớp')}</Sub>}
                  </td>
                </tr>
              ))}
            </Table>
          </section>
        ))}
      </>}
    </Sheet>
  )
}
