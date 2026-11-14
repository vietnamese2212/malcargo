// "Chia ra nhiều xe" (chủ dự án 14/11: phát triển app thật sự): chuyến không vừa một xe ⇒ app tính cần mấy xe cùng loại, xem trước
// từng xe chở gì, bấm một nút là thành các chuyến mới — mỗi chuyến mở ra đều "Vừa xe". Tính trong worker riêng (split.worker.ts).
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Split, Truck } from 'lucide-react'
import type { TripInput, TruckInput } from '../engine/plan'
import { partInput, type SplitPart } from '../engine/split'
import type { SplitReq, SplitRes } from '../engine/split.worker'
import type { Trip, Vehicle } from '../data/types'
import { splitTripInto } from '../data/store'
import { Badge, Button, Sheet, cx, fmtDec, fmtInt, fmtKgShort } from '../ui/kit'
import { t, tx } from '../i18n'

type Done = Extract<SplitRes, { done: unknown }>['done']

export function SplitSheet({ open, onClose, trip, vehicle, vehicles, input, candidates, onDone }: {
  open: boolean; onClose: () => void; trip: Trip; vehicle: Vehicle; vehicles: Vehicle[]
  input: TripInput | null; candidates: TruckInput[]; onDone: (n: number) => void
}) {
  const [progress, setProgress] = useState(1)
  const [res, setRes] = useState<Done | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [small, setSmall] = useState(true)   // chuyến cuối dùng xe nhỏ hơn (có gợi ý thì mặc định bật)

  useEffect(() => {
    if (!open || !input) return
    setRes(null); setErr(null); setProgress(1); setSmall(true)
    const w = new Worker(new URL('../engine/split.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<SplitRes>) => {
      const m = e.data
      if ('progress' in m) setProgress(m.progress)
      else if ('done' in m) setRes(m.done)
      else setErr(m.error)
    }
    w.onerror = e => { e.preventDefault(); setErr(e.message || 'worker') }
    w.postMessage({ input, candidates } satisfies SplitReq)
    return () => w.terminate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const last = res?.lastTruck ? vehicles.find(v => v.id === res.lastTruck) : undefined
  const rows = useMemo(() => (res && input ? res.parts.map((p, k) => summary(input, p, k, res.parts)) : []), [res, input])
  const splitNames = useMemo(() => rows.flatMap(r => r.orders.filter(o => o.copy).map(o => o.name)), [rows])
  const n = res?.parts.length ?? 0

  const apply = () => {
    if (!res) return
    const ids = splitTripInto(trip.id, res.parts, last && small ? last.id : null)
    if (ids.length) onDone(ids.length + 1)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('Chia ra nhiều xe')}
      subtitle={<span className="num">{tx(vehicle.name)} · <span className="whitespace-nowrap">{fmtDec(vehicle.l / 1000, 2)} × {fmtDec(vehicle.w / 1000, 2)} × {fmtDec(vehicle.h / 1000, 2)} m</span>{vehicle.payloadKg ? <> · {fmtKgShort(vehicle.payloadKg)}</> : null}</span>}
      footer={<div className="flex gap-2">{res && !res.error && n > 1 ? (
        <>
          <Button className="flex-1 sm:flex-none" onClick={onClose}>{t('Huỷ')}</Button>
          <Button variant="primary" className="flex-1 sm:flex-none" onClick={apply}><Split size={16} />{t('Tạo {n} chuyến mới', { n: fmtInt(n - 1) })}</Button>
        </>
      ) : <Button className="flex-1 sm:flex-none" onClick={onClose}>{t('Đóng')}</Button>}</div>}>
      {err ? <p role="alert" className="break-words text-sm text-red-700">{t('Lỗi khi tính: {error}', { error: tx(err) })}</p>
        : !res ? (
          <p role="status" className="flex items-center gap-2 py-6 text-sm text-slate-700"><Loader2 size={18} className="animate-spin text-brand-600" />{t('Đang tính xe {n}…', { n: fmtInt(progress) })}</p>
        ) : res.error === 'unplaceable' ? (
          <div role="alert" className="space-y-1 text-sm text-red-800">
            <p className="font-semibold">{t('Có hàng không lên được xe này kể cả khi xe trống.')}</p>
            {res.stuck?.map((s, i) => <p key={i} className="break-words">{tx(s)}</p>)}
            <p className="text-slate-700">{t('Chọn xe khác hoặc sửa quy cách mã hàng.')}</p>
          </div>
        ) : res.error === 'too_many' ? (
          <p role="alert" className="text-sm text-red-800">{t('Cần hơn 20 xe {name}. Chọn xe lớn hơn.', { name: tx(vehicle.name) })}</p>
        ) : n < 2 ? (
          <p className="text-sm text-slate-700">{t('Chuyến này vừa một xe, không cần chia.')}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-[15px] font-semibold text-slate-900">{t('Cần {n} xe', { n: fmtInt(n) })}</p>
            <ol className="space-y-2">
              {rows.map((r, k) => {
                const v = k === n - 1 && last && small ? last : vehicle
                const pct = v.payloadKg && r.kgKnown ? (r.kg / v.payloadKg) * 100 : null
                return (
                  <li key={k} className="rounded-lg border border-slate-200">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-100 bg-slate-50 px-3 py-2">
                      <Truck size={16} className="shrink-0 text-slate-500" />
                      <span className="text-sm font-semibold text-slate-900">{t('Xe {n}', { n: k + 1 })}</span>
                      {k === 0 ? <Badge tone="blue">{t('chuyến này')}</Badge> : <Badge>{t('chuyến mới')}</Badge>}
                      {v !== vehicle && <span className="break-words text-[13px] text-slate-700">{tx(v.name)}</span>}
                      <span className="num ml-auto text-[13px] text-slate-700">
                        {t('{n} thùng', { n: fmtInt(r.cartons) })} · {fmtKgShort(r.kg)}{pct != null && <> · <span className={cx(pct >= 85 && 'font-semibold')}>{fmtDec(pct, 0)}%</span></>}
                      </span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {r.orders.map(o => (
                        <li key={o.id} className="flex items-baseline gap-2 px-3 py-1.5 text-[13px]">
                          <span className="min-w-0 flex-1 break-words text-slate-800">{tx(o.name)}{o.place && <span className="text-slate-600"> · {tx(o.place)}</span>}</span>
                          <span className="num shrink-0 text-slate-700">{t('{n} thùng', { n: fmtInt(o.cartons) })}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              })}
            </ol>
            {last && (
              <label className="tap -mx-1 flex cursor-pointer items-center gap-3 rounded-md px-1 text-sm text-slate-800 hover:bg-slate-50">
                <input type="checkbox" checked={small} onChange={e => setSmall(e.target.checked)} className="h-[18px] w-[18px] shrink-0 accent-brand-500" />
                <span>{t('Xe {n} chỉ cần {name} — dùng xe này', { n: n, name: tx(last.name) })}</span>
              </label>
            )}
            {!!splitNames.length && (
              <p className="text-[13px] leading-snug text-slate-600">{t('Đơn chia sang xe khác thành đơn mới cùng điểm giao, tên thêm số xe: {names}.', { names: splitNames.map(x => tx(x)).join(', ') })}</p>
            )}
          </div>
        )}
    </Sheet>
  )
}

/** Một xe trong bản xem trước: từng đơn mấy thùng (đơn bị chia hiện tên mới "(k)"), tổng thùng, kg. */
function summary(input: TripInput, part: SplitPart, k: number, parts: SplitPart[]) {
  const pi = partInput(input, part)
  let cartons = 0, kg = 0, kgKnown = true
  for (const o of pi.orders) for (const l of o.lines) {
    cartons += l.qty
    if (l.item.kg == null) kgKnown = false; else kg += l.qty * l.item.kg
  }
  // đơn có hàng ở xe trước ⇒ phần này là đơn mới "(k)"
  const before = new Set(parts.slice(0, k).flat().map(x => x.orderId))
  const orders = pi.orders.map(o => ({
    id: o.id, place: o.place, cartons: o.lines.reduce((s, l) => s + l.qty, 0),
    copy: before.has(o.id), name: before.has(o.id) ? `${o.name} (${k + 1})` : o.name,
  }))
  return { cartons, kg, kgKnown, orders }
}
