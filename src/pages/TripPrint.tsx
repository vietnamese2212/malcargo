// Phiếu xếp xe in A4 (chủ dự án 10/11: "ok có nút in") — bốc xếp ở cửa kho + tài xế cầm bản giấy kẹp cùng lệnh điều xe.
// Dựng một khối riêng gắn thẳng vào <body>; khi in, CSS (index.css, @media print) chỉ để lại khối này. Không thư viện PDF:
// hộp in của trình duyệt có sẵn "Lưu thành PDF".
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { TripResult } from '../engine/plan'
import type { Order, Vehicle } from '../data/types'
import type { resolveOrder } from '../data/resolve'
import { groupColor } from '../three/colors'
import { numLocale, t, tx } from '../i18n'
import { fmtDec, fmtDims, fmtInt, fmtKgShort, fmtM3 } from '../ui/kit'

type CountRow = TripResult['count'][number]
type ResolvedOrder = ReturnType<typeof resolveOrder>
const m = (mm: number) => fmtDec(mm / 1000, 2)

/** Cách xếp một dòng bảng đếm chân: "3 chân × 11 lớp + 1 chân × 4 lớp" / "2 pallet". */
export const stackText = (c: CountRow) => c.unit === 'pallet'
  ? t('{n} pallet', { n: c.placed })
  : c.stacks.map(([n, l]) => t('{n} chân × {l} lớp', { n, l })).join(' + ')
/** Ruột pallet gộp: "40 thùng Sữa 180ml x48 · 40 thùng Thạch túi 110ml x24". */
export const mixText = (c: CountRow) => c.mix?.map(x => t('{n} thùng {name}', { n: fmtInt(x.n), name: tx(x.label) })).join(' · ')

/** Một pallet trên phiếu in: "150 thùng/pallet · 10 lớp" (cột Số lượng đã ghi số pallet). */
const perPallet = (g?: TripResult['meta'][number]) => {
  const n = g?.layers?.reduce((s, l) => s + l.n, 0)
  return n ? t('{n} thùng/pallet · {l} lớp', { n: fmtInt(n), l: g!.layers!.length }) : ''
}

/** Kết luận của sơ đồ — cùng chữ, cùng số cho dải kết quả trên khung 3D và phiếu in. */
export function tripVerdict(r: TripResult, vehicle: Vehicle) {
  const p = r.plan
  const left = p.leftover.reduce((s, x) => s + x.count, 0)
  const pal = vehicle.kind === 'pallet'
  const sum = (u: 'pallet' | 'thùng', k: 'placed' | 'total') => r.count.filter(c => c.unit === u).reduce((s, c) => s + c[k], 0) // i18n-ok — đơn vị của thuật toán
  const palPlaced = sum('pallet', 'placed'), palTotal = sum('pallet', 'total')
  const topPlaced = sum('thùng', 'placed'), topTotal = sum('thùng', 'total') // i18n-ok
  const leftWhat = pal
    ? [palTotal - palPlaced ? t('{n} pallet', { n: fmtInt(palTotal - palPlaced) }) : '', topTotal - topPlaced ? t('{n} thùng', { n: fmtInt(topTotal - topPlaced) }) : ''].filter(Boolean).join(' + ')
    : t('{n} thùng', { n: fmtInt(left) })
  const head = r.errors.length ? t('Không xếp được') : r.fits ? t('Vừa xe') : left ? t('Thiếu {what}', { what: leftWhat }) : t('Quá tải')
  const count = pal ? `${fmtInt(palPlaced)}/${fmtInt(palTotal)}` : `${fmtInt(p.placedCount)}/${fmtInt(p.totalCount)}`
  // có mã chưa khai kg ⇒ tải chưa rõ: đừng ghi "Tải 0%" (thử 31/10) — biết được một phần thì ghi "≥", chưa biết gì thì "?"
  const kgPart = (s: string) => (r.totals.kgKnown ? s : r.weightKg > 0 ? `≥${s}` : '?')
  const loadPct = r.totals.kgKnown || r.weightKg > 0 ? r.payloadPct : null
  return { left, pal, palPlaced, palTotal, topPlaced, topTotal, head, count, kgPart, loadPct }
}

/** Khung 3D đang hiện ⇒ ảnh PNG (góc người dùng đang xem). Chưa có khung ⇒ null. */
export const sceneShot = () => document.querySelector<HTMLCanvasElement>('[data-scene] canvas')?.toDataURL('image/png') ?? null

export function TripPrint({ png, tripName, vehicle, orders, resolved, r, colors, onDone }: {
  png: string | null; tripName: string; vehicle: Vehicle; orders: Order[]; resolved: ResolvedOrder[]
  r: TripResult; colors: Map<string, string>; onDone: () => void
}) {
  // dựng xong (ảnh đã nạp) mới mở hộp in; in xong / huỷ ⇒ bỏ khối
  useEffect(() => {
    let gone = false
    const done = () => { if (!gone) { gone = true; onDone() } }
    window.addEventListener('afterprint', done)
    const img = document.querySelector<HTMLImageElement>('[data-print] img')
    const go = () => requestAnimationFrame(() => { window.print(); setTimeout(done, 500) })
    if (img && !img.complete) img.addEventListener('load', go, { once: true }); else go()
    return () => { window.removeEventListener('afterprint', done) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const v = tripVerdict(r, vehicle), p = r.plan
  const now = new Date().toLocaleString(numLocale(), { dateStyle: 'short', timeStyle: 'short' })
  const cell = 'border border-slate-400 px-1.5 py-1 align-top'
  const th = cell + ' bg-slate-100 text-left font-semibold'
  return createPortal(
    <div data-print className="bg-white text-[11px] leading-snug text-black">
      <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-2">
        <div className="min-w-0">
          <div className="text-[18px] font-bold uppercase tracking-wide">{t('Phiếu xếp xe')}</div>
          <div className="break-words text-[13px] font-semibold">{tx(tripName)}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[15px] font-extrabold italic">MAL <span className="not-italic text-[10px] font-bold tracking-wider">CARGO</span></div>
          <div className="text-slate-700">{t('In lúc {time}', { time: now })}</div>
        </div>
      </div>

      <table className="mt-2 w-full border-collapse">
        <tbody>
          <tr>
            <th className={th} style={{ width: '16%' }}>{t('Xe')}</th>
            <td className={cell}>{tx(vehicle.name)}{vehicle.plate ? ` · ${vehicle.plate}` : ''} · {vehicle.kind === 'pallet' ? 'Pallet' : t('Thùng rời')}</td>
            <th className={th} style={{ width: '16%' }}>{t('Kết quả')}</th>
            <td className={cell + ' font-semibold'}>{v.head}</td>
          </tr>
          <tr>
            <th className={th}>{t('Lòng thùng')}</th>
            <td className={cell}><span className="num whitespace-nowrap">{fmtDims(vehicle.l, vehicle.w, vehicle.h)} mm</span></td>
            <th className={th}>{v.pal ? 'Pallet' : t('Thùng')}</th>
            <td className={cell + ' num'}>{v.count}{v.pal && v.topTotal ? ` ${t('+{n} th', { n: fmtInt(v.topPlaced) })}` : ''}</td>
          </tr>
          <tr>
            <th className={th}>{t('Tải')}</th>
            <td className={cell + ' num'}>
              {v.kgPart(fmtKgShort(r.weightKg))}{vehicle.payloadKg ? ` / ${fmtKgShort(vehicle.payloadKg)}` : ''}{v.loadPct != null ? ` · ${fmtDec(v.loadPct, 0)}%` : ''}
            </td>
            <th className={th}>{t('Thể tích')} · {t('Sàn')}</th>
            <td className={cell + ' num'}>{fmtM3(r.totals.m3)} · {fmtDec(p.volumePct, 0)}% · {m((vehicle.l * p.lengthUsedPct) / 100)}/{m(vehicle.l)} m</td>
          </tr>
        </tbody>
      </table>
      {!!r.warnings.length && (
        <ul className="mt-1.5 list-disc pl-4 text-[10.5px]">{r.warnings.map((w, i) => <li key={i}>{tx(w)}</li>)}</ul>
      )}

      {png && (
        <figure className="mt-2 break-inside-avoid">
          <img src={png} alt={t('Sơ đồ 3D')} className="mx-auto max-h-[66mm] w-auto max-w-full border border-slate-400 object-contain" />
          <figcaption className="mt-0.5 text-center text-[10px] text-slate-700">{t('Sơ đồ 3D (góc đang xem)')}</figcaption>
        </figure>
      )}

      <h2 className="mt-3 text-[12.5px] font-bold">{t('Đơn hàng — thứ tự giao')}</h2>
      <table className="mt-1 w-full border-collapse">
        <thead>
          <tr><th className={th} style={{ width: '5%' }}>#</th><th className={th}>{t('Đơn')} · {t('Điểm giao')}</th><th className={th}>{t('Hàng')}</th><th className={th + ' text-right'} style={{ width: '13%' }}>{t('Số thùng')}</th></tr>
        </thead>
        <tbody>
          {orders.flatMap((o, i) => {
            const lines = resolved[i]?.lines.filter(l => l.qty > 0) ?? []
            return lines.map((l, j) => (
              <tr key={`${o.id}-${l.item.id}`} className="break-inside-avoid">
                {j === 0 && <td className={cell + ' num text-center font-semibold'} rowSpan={lines.length}>{i + 1}</td>}
                {j === 0 && <td className={cell + ' break-words'} rowSpan={lines.length}><b>{tx(o.name)}</b>{o.place ? <div>{tx(o.place)}</div> : null}</td>}
                <td className={cell + ' break-words'}>{l.item.code ? <b>{l.item.code}</b> : null}{l.item.code ? ' · ' : ''}{tx(l.item.name)}</td>
                <td className={cell + ' num text-right'}>{fmtInt(l.qty)}</td>
              </tr>
            ))
          })}
        </tbody>
      </table>

      <h2 className="mt-3 text-[12.5px] font-bold">{t('Bảng đếm chân')} <span className="font-normal">· {t('thứ tự xếp từ cabin ra cửa')}</span></h2>
      <table className="mt-1 w-full border-collapse">
        <thead>
          <tr><th className={th} style={{ width: '5%' }}>#</th><th className={th}>{t('Hàng')}</th><th className={th}>{t('Đơn')}</th><th className={th}>{t('Cách xếp')}</th><th className={th + ' text-right'} style={{ width: '13%' }}>{t('Số lượng')}</th></tr>
        </thead>
        <tbody>
          {r.count.map((c, i) => (
            <tr key={c.group} className="break-inside-avoid">
              <td className={cell + ' num text-center'}>{i + 1}</td>
              <td className={cell + ' break-words'}>
                <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-black/40 align-middle" style={{ background: groupColor(r.meta[c.group], colors) }} />
                <b>{tx(c.label)}</b>{c.onTopOfOthers ? ` · ${t('trên nóc')}` : ''}
                {c.mix && <div className="text-[10px]">{t('Gồm {list}', { list: mixText(c) ?? '' })}</div>}
              </td>
              <td className={cell + ' break-words'}>{tx(c.orderName)}</td>
              <td className={cell + ' num'}>{(c.unit === 'pallet' ? perPallet(r.meta[c.group]) : stackText(c)) || '—'}</td>
              <td className={cell + ' num text-right'}>
                {c.placed < c.total ? `${fmtInt(c.placed)}/${fmtInt(c.total)}` : fmtInt(c.placed)}{' '}
                {c.unit === 'pallet' ? t('{n:pallet|pallet}', { n: c.total }) : t('{n:thùng|thùng}', { n: c.total })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 grid break-inside-avoid grid-cols-3 gap-4 text-center">
        {[t('Người lập phiếu'), t('Thủ kho'), t('Tài xế')].map(s => (
          <div key={s}><div className="font-semibold">{s}</div><div className="text-[10px] text-slate-700">{t('(ký, ghi rõ họ tên)')}</div><div className="h-12" /></div>
        ))}
      </div>
    </div>,
    document.body,
  )
}
