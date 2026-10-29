// DIỄN GIẢI — popup mở từ nút trên khung 3D. Nhìn là biết, ít chữ (chủ dự án 29/10: "phải đọc văn nhiều quá"):
//  · xe thùng rời: mỗi mã HAI con số — khối mấy lớp, lẻ trên khối mấy thùng;
//  · xe pallet: theo TỪNG PALLET — tổng / chẵn / lẻ, pallet chẵn mỗi mã mấy cái, pallet lẻ nào riêng, nào GỘP CHUNG mã nào.
// Số lấy từ sơ đồ đã tính (`engine/explain.ts`).
import type { ReactNode } from 'react'
import { ClipboardCopy } from 'lucide-react'
import type { Item, Vehicle } from '../data/types'
import type { TripResult } from '../engine/plan'
import { explainLoose, explainPalletCards, type LooseNote, type PalletCard } from '../engine/explain'
import { tint } from '../three/colors'
import { Badge, Button, Sheet, cx, fmtDec, fmtInt } from '../ui/kit'
import { t, tx } from '../i18n'

const m = (mm: number) => `${fmtDec(mm / 1000, 2)} m`
const span = (a: number, b: number) => (a === b ? fmtInt(a) : `${fmtInt(a)}–${fmtInt(b)}`)
const aboveSpan = (n: LooseNote) => span(n.layers + 1, n.layers + n.aboveLayers)
const lowText = (n: LooseNote) => n.low.map(([k, l]) => t('+ {n} chân thấp hơn ({l} lớp)', { n: k, l }))

// ── ô bảng ──
const TH = 'whitespace-nowrap px-2 py-2 text-left text-[12px] font-semibold text-slate-600 first:pl-0 last:pr-0'
const TD = 'px-2 py-2.5 align-top first:pl-0 last:pr-0'
const Sub = ({ children, warn, className }: { children: ReactNode; warn?: boolean; className?: string }) =>
  <span className={cx('mt-0.5 block text-[12px] leading-snug', warn ? 'font-medium text-red-700' : 'text-slate-600', className)}>{children}</span>
const Big = ({ children }: { children: ReactNode }) => <span className="num block whitespace-nowrap text-[15px] font-semibold leading-snug text-slate-900">{children}</span>
const WIDE = 'max-sm:hidden', NARROW = 'sm:hidden'
const Swatch = ({ color }: { color: string }) => <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-sm border border-black/20" style={{ background: color }} />

function Table({ head, children }: { head: (string | [string, string])[]; children: ReactNode }) {
  return (
    <table className="w-full border-collapse">
      <thead><tr className="border-b border-slate-300">{head.map((h, i) => <th key={i} className={cx(TH, Array.isArray(h) && h[1])}>{Array.isArray(h) ? h[0] : h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  )
}
function NameCell({ color, name, sub }: { color: string; name: string; sub?: ReactNode }) {
  return (
    <td className={cx(TD, 'w-[46%]')}>
      <span className="flex items-start gap-2">
        <Swatch color={color} />
        <span className="min-w-0">
          <span className="block break-words text-sm font-semibold leading-snug text-slate-900">{name}</span>
          {sub && <Sub>{sub}</Sub>}
        </span>
      </span>
    </td>
  )
}
function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: ReactNode; tone?: 'blue' }) {
  return (
    <div className={cx('min-w-0 flex-1 rounded-lg border px-3 py-2', tone === 'blue' ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-slate-50')}>
      <div className="text-[12px] text-slate-600">{label}</div>
      <div className="num text-2xl font-semibold leading-tight text-slate-900">{fmtInt(value)}</div>
      {sub && <div className="text-[12px] font-medium text-brand-700">{sub}</div>}
    </div>
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
  const cards = pallet ? explainPalletCards(r) : []
  const multiOrder = new Set((pallet ? cards : loose).map(x => x.orderId)).size > 1
  const full = cards.filter(c => c.kind === 'full'), part = cards.filter(c => c.kind !== 'full')
  const sum = (cs: PalletCard[]) => cs.reduce((s, c) => s + c.count, 0)
  const shared = sum(part.filter(c => c.kind === 'mixed'))
  const posOf = (c: PalletCard, i: number) => (c.parts.length < 2 ? null : i === 0 ? t('dưới cùng') : i === c.parts.length - 1 ? t('trên cùng') : null)

  const copy = async () => {
    const head = `${tx(tripName)} — ${tx(vehicle.name)}${vehicle.plate ? ` (${vehicle.plate})` : ''}`
    const ord = (o: string) => (multiOrder ? ` [${tx(o)}]` : '')
    const line = (name: string, order: string, bits: (string | null)[]) => '• ' + name + ord(order) + ': ' + bits.filter(Boolean).join(' · ')
    const looseText = (n: LooseNote) => {
      const block = n.placed ? t('khối {l} lớp ({n} chân)', { l: n.layers, n: n.fullCols }) : null
      const top = n.above ? t('lẻ trên khối {n} thùng', { n: n.above }) : n.low.length ? null : t('Không lẻ')
      const miss = n.placed < n.total ? t('Chưa lên xe {n} thùng', { n: n.total - n.placed }) : null
      return line(nameOf(n.itemId, n.label), n.orderName, [block, top, ...lowText(n), miss])
    }
    const fullText = (c: PalletCard) => {
      const p = c.parts[0], each = t('{p} × {n} thùng', { p: c.count, n: fmtInt(p.n) })
      return line(nameOf(p.itemId, p.label), c.orderName, [each, t('cao {h}', { h: m(c.heightMm) })])
    }
    const partText = (c: PalletCard, i: number) => {
      const tag = c.kind === 'mixed' ? t('gộp chung') : t('riêng')
      const what = c.parts.map(p => nameOf(p.itemId, p.label) + ' ' + t('{n} thùng', { n: fmtInt(p.n) })).join(' + ')
      return line(t('Lẻ {i}', { i: i + 1 }) + ' (' + tag + ')', c.orderName, [what, t('cao {h}', { h: m(c.heightMm) })])
    }
    const total = t('{total} pallet: {full} chẵn · {part} lẻ', { total: sum(cards), full: sum(full), part: sum(part) })
    const sharedNote = shared ? ' (' + t('{n} gộp chung', { n: shared }) + ')' : ''
    const lines = !pallet ? loose.map(looseText) : [
      total + sharedNote,
      ...(full.length ? [t('Pallet chẵn') + ':', ...full.map(fullText)] : []),
      ...(part.length ? [t('Pallet lẻ') + ':', ...part.map(partText)] : []),
    ]
    try { await navigator.clipboard.writeText([head, ...lines].join('\n')); onToast(t('Đã chép diễn giải')) }
    catch { onToast(t('Trình duyệt chặn chép, hãy chụp màn hình')) }
  }

  return (
    <Sheet open onClose={onClose} wide="table" title={pallet ? t('Diễn giải pallet') : t('Diễn giải từng mã')}
      subtitle={pallet ? t('Bao nhiêu pallet, pallet lẻ nào gộp chung') : t('Khối mấy lớp, lẻ trên khối mấy thùng')}
      footer={<div className="flex gap-2">
        <Button className="flex-1" onClick={onClose}>{t('Đóng')}</Button>
        <Button variant="primary" className="flex-[2]" onClick={copy}><ClipboardCopy size={17} />{t('Chép để gửi Zalo')}</Button>
      </div>}>
      {!pallet ? (
        <Table head={[t('Mã hàng'), t('Khối hàng'), t('Lẻ trên khối')]}>
          {loose.map((n, i) => (
            <tr key={n.group} className={cx(i > 0 && 'border-t border-slate-100')}>
              <NameCell color={colorOf(n.itemId)} name={nameOf(n.itemId, n.label)}
                sub={[multiOrder ? tx(n.orderName) : null, t('{n} thùng', { n: fmtInt(n.total) })].filter(Boolean).join(' · ')} />
              <td className={TD}>
                {n.placed ? <>
                  <Big>{t('{n} lớp', { n: n.layers })}</Big>
                  <Sub>{t('{n} chân · cao {h}', { n: n.fullCols, h: m(n.bodyMm) })}</Sub>
                  {n.onTop && <Badge tone="amber" className="mt-1">{t('trên nóc')}</Badge>}
                </> : <Big>—</Big>}
              </td>
              <td className={TD}>
                <Big>{n.above ? t('{n} thùng', { n: fmtInt(n.above) }) : '—'}</Big>
                {n.above > 0 && <Sub>{t('lớp {l}', { l: aboveSpan(n) })}</Sub>}
                {lowText(n).map(s => <Sub key={s}>{s}</Sub>)}
                {n.placed < n.total && <Sub warn>{t('Chưa lên xe {n} thùng', { n: n.total - n.placed })}</Sub>}
              </td>
            </tr>
          ))}
        </Table>
      ) : <>
        <div className="flex gap-2">
          <Stat label={t('Tổng')} value={sum(cards)} />
          <Stat label={t('Pallet chẵn')} value={sum(full)} />
          <Stat label={t('Pallet lẻ')} value={sum(part)} tone={shared ? 'blue' : undefined} sub={shared ? t('{n} gộp chung', { n: shared }) : undefined} />
        </div>

        {full.length > 0 && <>
          <h3 className="mb-1 mt-5 text-[15px] font-semibold text-slate-900">{t('Pallet chẵn')}</h3>
          <Table head={[t('Mã hàng'), t('Số pallet'), t('Mỗi pallet'), [t('Cao'), WIDE]]}>
            {full.map((c, i) => {
              const p = c.parts[0]
              return (
                <tr key={c.group} className={cx(i > 0 && 'border-t border-slate-100')}>
                  <NameCell color={colorOf(p.itemId)} name={nameOf(p.itemId, p.label)} sub={multiOrder ? tx(c.orderName) : undefined} />
                  <td className={TD}>
                    <Big>{fmtInt(c.count)}</Big>
                    {c.placed < c.count && <Sub warn>{t('{n} pallet chưa lên xe', { n: c.count - c.placed })}</Sub>}
                  </td>
                  <td className={TD}>
                    <Big>{p.n ? t('{n} thùng', { n: fmtInt(p.n) }) : '—'}</Big>
                    {p.n > 0 && <Sub>{t('{per} × {l} lớp', { per: p.perLayer, l: p.layers })}</Sub>}
                    <Sub className={NARROW}>{t('cao {h}', { h: m(c.heightMm) })}</Sub>
                  </td>
                  <td className={cx(TD, WIDE)}><Big>{m(c.heightMm)}</Big></td>
                </tr>
              )
            })}
          </Table>
        </>}

        {part.length > 0 && <>
          <h3 className="mb-2 mt-5 text-[15px] font-semibold text-slate-900">{t('Pallet lẻ')}</h3>
          <div className="space-y-2">
            {part.map((c, i) => (
              <div key={c.group} className={cx('rounded-lg border px-3 py-2', c.kind === 'mixed' ? 'border-brand-300' : 'border-slate-200')}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-slate-900">{t('Lẻ {i}', { i: i + 1 })}{c.count > 1 && <span className="num font-normal text-slate-600"> × {c.count}</span>}</span>
                  <Badge tone={c.kind === 'mixed' ? 'blue' : undefined}>{c.kind === 'mixed' ? t('gộp chung {n} mã', { n: c.parts.length }) : t('riêng')}</Badge>
                  {multiOrder && <span className="text-[12px] text-slate-600">{tx(c.orderName)}</span>}
                  <span className="num ml-auto whitespace-nowrap text-sm font-semibold text-slate-900">{t('cao {h}', { h: m(c.heightMm) })}</span>
                </div>
                <ul className="mt-1.5 space-y-1">
                  {c.parts.map((p, k) => (
                    <li key={p.itemId + k} className="flex items-start gap-2">
                      <Swatch color={colorOf(p.itemId)} />
                      <span className="min-w-0 flex-1 break-words text-sm leading-snug text-slate-900">
                        {nameOf(p.itemId, p.label)}
                        {posOf(c, k) && <span className="text-[12px] text-slate-600"> · {posOf(c, k)}</span>}
                      </span>
                      <span className="num whitespace-nowrap text-sm font-semibold text-slate-900">{p.n ? t('{n} thùng', { n: fmtInt(p.n) }) : '—'}</span>
                    </li>
                  ))}
                </ul>
                {c.placed < c.count && <Sub warn>{t('{n} pallet chưa lên xe', { n: c.count - c.placed })}</Sub>}
              </div>
            ))}
          </div>
        </>}
      </>}
    </Sheet>
  )
}
