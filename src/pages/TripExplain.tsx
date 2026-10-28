// DIỄN GIẢI TỪNG MÃ trên Bàn xếp xe (chủ dự án 28/10: "xếp khối như vậy thì cao bao nhiêu, lẻ bao nhiêu của từng
// mã — người làm tính được ngay từ lúc chưa lên hàng để có chiến thuật, không cần bước trước bước sau"). Xe thùng
// rời: mỗi khối mấy chân, cao mấy lớp / bao nhiêu mét, phần đủ lớp và phần lẻ (chân thấp / thùng nổi trên mặt).
// Xe pallet: mỗi mã mấy pallet chẵn (thùng/lớp × lớp, cao), lẻ bao nhiêu nằm pallet nào lớp thứ mấy; ruột từng
// pallet gộp từ dưới lên. Số lấy từ sơ đồ đã tính (`engine/explain.ts`).
import { ClipboardCopy } from 'lucide-react'
import type { Item, Vehicle } from '../data/types'
import type { TripResult } from '../engine/plan'
import { explainLoose, explainPallets, type LooseNote, type MixNote, type PalletItemNote } from '../engine/explain'
import { tint } from '../three/colors'
import { Button, SectionBand, cx, fmtDec, fmtInt } from '../ui/kit'
import { t, tx } from '../i18n'

const m = (mm: number) => `${fmtDec(mm / 1000, 2)} m`
// hiện trên màn: số dính với đơn vị đi sau ("112 thùng", "0,78 m", "(lớp 8)") — xuống dòng không bẻ giữa cụm
const glue = (s: string) => s.replace(/(\d) (?=[^\s\d=·+→/×(])/g, '$1 ').replace(/ (?=[\d–]+\))/g, ' ')
const span = (a: number, b: number) => (a === b ? fmtInt(a) : `${fmtInt(a)}–${fmtInt(b)}`)

type Row = { key: string; groups: number[]; color: string; name: string; order: string; total: string; lines: { text: string; warn?: boolean }[] }

function looseRow(n: LooseNote, name: string, color: string): Row {
  const lines: Row['lines'] = []
  if (n.placed) {
    lines.push({ text: t('Khối {n} chân × {l} lớp = {c} thùng', { n: n.fullCols, l: n.layers, c: fmtInt(n.fullCols * n.layers) }) })
    lines.push({ text: t('Cao {h} · chiếm {len} dọc xe', { h: m(n.bodyMm), len: m(n.lenMm) }) })
    const lv = span(n.layers + 1, n.layers + n.aboveLayers)
    const parts = [
      ...n.low.map(([k, l]) => t('{n} chân × {l} lớp', { n: k, l })),
      ...(n.above ? [t('{n} thùng nổi (lớp {l})', { n: n.above, l: lv })] : []),
    ]
    lines.push({ text: !n.rest ? t('Không lẻ') : n.low.length ? t('Lẻ {n} thùng: {list}', { n: n.rest, list: parts.join(' + ') })
      : t('Lẻ {n} thùng nổi trên mặt khối (lớp {l})', { n: n.rest, l: lv }) })
    if (n.onTop) lines.push({ text: t('Trên nóc hàng khác · đỉnh cách sàn {h}', { h: m(n.topMm) }) })
  }
  if (n.placed < n.total) lines.push({ text: t('Chưa lên xe {n} thùng', { n: n.total - n.placed }), warn: true })
  return { key: `l${n.group}`, groups: [n.group], color, name, order: n.orderName, total: t('{n} thùng', { n: fmtInt(n.total) }), lines }
}

function palletRow(n: PalletItemNote, name: string, color: string): Row {
  const lines: Row['lines'] = []
  const f = n.full
  if (f) {
    lines.push({ text: t('{p} pallet chẵn: {per} thùng/lớp × {l} lớp = {n} thùng · cao {h}', { p: f.pallets, per: f.perLayer, l: f.layers, n: fmtInt(f.perPallet), h: m(f.heightMm) }) })
    if (f.left) lines.push({ text: t('{n} pallet chưa lên xe', { n: f.left }), warn: true })
  }
  for (const r of n.rest) {
    if (!r.mixed) lines.push({ text: t('Lẻ {n} thùng → pallet riêng: {l} lớp · cao {h}', { n: r.n, l: r.of, h: m(r.heightMm) }) })
    else {
      const pos = r.from === 1 ? t('dưới cùng') : r.to === r.of ? t('trên cùng') : t('giữa')
      lines.push({ text: t('Lẻ {n} thùng → {name}: lớp {range} / {of} ({pos})', { n: r.n, name: tx(r.label), range: span(r.from, r.to), of: r.of, pos }) })
    }
  }
  if (!n.rest.length) lines.push({ text: t('Không lẻ') })
  return { key: `p${n.orderName}|${n.itemId}`, groups: [...(f ? [f.group] : []), ...n.rest.map(r => r.group)], color, name, order: n.orderName, total: t('{n} thùng', { n: fmtInt(n.total) }), lines }
}

function mixLines(x: MixNote, nameOf: (id: string) => string): string[] {
  return x.levels.map(lv => {
    if (lv.parts.length > 1) return t('{t} lớp ghép: {list}', { t: lv.times, list: lv.parts.map(p => `${fmtInt(p.n)} ${nameOf(p.itemId)}`).join(' + ') })
    const p = lv.parts[0]
    return lv.full ? t('{t} lớp {name} · {n} thùng/lớp', { t: lv.times, name: nameOf(p.itemId), n: p.n })
      : t('{t} lớp {name} · {n} thùng (chưa đủ lớp)', { t: lv.times, name: nameOf(p.itemId), n: p.n })
  })
}

export function ExplainSheet({ r, vehicle, items, colors, tripName, focus, onFocus, onToast }: {
  r: TripResult | null; vehicle?: Vehicle; items: Item[]; colors: Map<string, string>; tripName: string
  focus: Set<number> | null; onFocus: (groups: number[]) => void; onToast: (s: string) => void
}) {
  if (!r || !vehicle) return <p className="px-4 py-5 text-sm text-slate-600">{t('Thêm hàng để có diễn giải.')}</p>
  const nameOf = (id: string | null, fallback = '') => tx(items.find(i => i.id === id)?.name ?? fallback)
  const colorOf = (id: string | null) => tint(colors.get(id ?? '') ?? '#7d8794')
  const pallet = vehicle.kind === 'pallet'
  let rows: Row[], mixes: MixNote[] = []
  if (pallet) {
    const ex = explainPallets(r)
    rows = ex.items.map(n => palletRow(n, nameOf(n.itemId, n.label), colorOf(n.itemId)))
    mixes = ex.mixes
  } else rows = explainLoose(r).map(n => looseRow(n, nameOf(n.itemId, n.label), colorOf(n.itemId)))
  const multiOrder = new Set(rows.map(x => x.order)).size > 1

  const copy = async () => {
    const text = [
      `${tx(tripName)} — ${tx(vehicle.name)}${vehicle.plate ? ` (${vehicle.plate})` : ''}`,
      t('Diễn giải từng mã:'),
      ...rows.flatMap(x => [`• ${x.name}${multiOrder ? ` [${tx(x.order)}]` : ''} — ${x.total}`, ...x.lines.map(l => `   ${l.text}`)]),
      ...(mixes.length ? [t('Pallet gộp (từ dưới lên):'), ...mixes.flatMap(x => [`• ${tx(x.label)} [${tx(x.orderName)}] — ${t('cao {h}', { h: m(x.heightMm) })}`, ...mixLines(x, id => nameOf(id)).map(s => `   ${s}`)])] : []),
    ]
    try { await navigator.clipboard.writeText(text.join('\n')); onToast(t('Đã chép diễn giải')) }
    catch { onToast(t('Trình duyệt chặn chép, hãy chụp màn hình')) }
  }

  return (
    <section className="pt-3">
      <div className="px-4"><Button className="w-full" onClick={copy}><ClipboardCopy size={17} />{t('Chép để gửi Zalo')}</Button></div>
      <SectionBand title={pallet ? t('Từng mã: pallet chẵn, lẻ nằm đâu') : t('Từng khối: cao bao nhiêu, lẻ bao nhiêu')} meta={t('· bấm một dòng để soi trên xe')} className="mt-3" />
      <div className="divide-y divide-slate-100">
        {rows.map(x => {
          const on = x.groups.length > 0 && x.groups.every(g => focus?.has(g))
          return (
            <button key={x.key} type="button" onClick={() => onFocus(x.groups)} aria-pressed={on}
              className={cx('grid w-full grid-cols-[16px_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-2.5 text-left transition-colors', on ? 'bg-brand-50' : 'hover:bg-slate-50')}>
              <span className="mt-1 h-4 w-4 rounded-sm border border-black/20" style={{ background: x.color }} />
              <span className="min-w-0">
                <span className="block break-words text-sm font-semibold leading-snug text-slate-900">{x.name}</span>
                {multiOrder && <span className="block text-[13px] text-slate-600">{tx(x.order)}</span>}
                {x.lines.map((l, i) => (
                  <span key={i} className={cx('num mt-0.5 block break-words text-[13px] leading-snug', l.warn ? 'font-medium text-red-700' : 'text-slate-800')}>{glue(l.text)}</span>
                ))}
              </span>
              <span className="num whitespace-nowrap text-right text-sm font-semibold text-slate-900">{x.total}</span>
            </button>
          )
        })}
      </div>
      {mixes.length > 0 && <>
        <SectionBand title={t('Pallet gộp')} meta={t('· từ dưới lên')} className="mt-1" />
        <div className="divide-y divide-slate-100">
          {mixes.map(x => {
            const on = !!focus?.has(x.group)
            return (
              <button key={x.group} type="button" onClick={() => onFocus([x.group])} aria-pressed={on}
                className={cx('block w-full px-4 py-2.5 text-left transition-colors', on ? 'bg-brand-50' : 'hover:bg-slate-50')}>
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words text-sm font-semibold text-slate-900">{tx(x.label)}{multiOrder && <span className="font-normal text-slate-600"> · {tx(x.orderName)}</span>}</span>
                  <span className="num whitespace-nowrap text-sm font-semibold text-slate-900">{t('cao {h}', { h: m(x.heightMm) })}</span>
                </span>
                <ol className="mt-1 space-y-0.5">
                  {mixLines(x, id => nameOf(id)).map((s, i) => <li key={i} className="num break-words text-[13px] leading-snug text-slate-800">{glue(s)}</li>)}
                </ol>
              </button>
            )
          })}
        </div>
      </>}
    </section>
  )
}
