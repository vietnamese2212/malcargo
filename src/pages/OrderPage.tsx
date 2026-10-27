// Sửa đơn — tự lưu mỗi lần đổi, tổng cập nhật ngay, một nút đi thẳng sang xếp xe.
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, ClipboardList, Minus, Plus, Trash2, X } from 'lucide-react'
import { isSample, newId, newTripLabel, useAllItems, useData } from '../data/store'
import type { Order } from '../data/types'
import { orderTotals } from '../engine/plan'
import { resolveOrder } from '../data/resolve'
import { BoxGlyph, Button, Confirm, Empty, Field, IconButton, SectionBand, TextInput, cx, fmtDec, fmtDims, fmtInt, fmtKgShort, fmtM3 } from '../ui/kit'
import { ListCard, Page, PageHeader } from '../ui/Shell'
import { ItemPicker } from '../ui/ItemPicker'
import { go, replaceRoute } from '../ui/route'

export default function OrderPage({ id, back }: { id: string; back?: string }) {
  const order = useData(s => s.orders.find(o => o.id === id))
  const trips = useData(s => s.trips)
  const upsert = useData(s => s.upsertOrder)
  const removeOrder = useData(s => s.removeOrder)
  const upsertTrip = useData(s => s.upsertTrip)
  const pallet = useData(s => s.pallet)
  const items = useAllItems()
  const [picking, setPicking] = useState(false)
  const [askDel, setAskDel] = useState(false)
  const backTrip = back?.startsWith('trip:') ? trips.find(t => t.id === back.slice(5)) : undefined
  const backHref = back?.startsWith('trip:') ? `#/trip/${back.slice(5)}` : '#/orders'
  const backLabel = backTrip?.name ?? 'Đơn hàng'

  // sửa đơn MẪU ⇒ chuyến mẫu đã tách thành chuyến mới: chuyển sang bản sao của đơn này (lối về trỏ chuyến mới)
  const fork = useData(s => s.fork)
  const markForkSeen = useData(s => s.markForkSeen)
  useEffect(() => {
    if (!fork || fork.seen || !fork.orders[id]) return
    markForkSeen()
    replaceRoute({ page: 'order', id: fork.orders[id], back: back === `trip:${fork.from}` ? `trip:${fork.to}` : back })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fork, id])

  const resolved = useMemo(() => (order ? resolveOrder(order, items) : null), [order, items])
  const totals = useMemo(() => (resolved ? orderTotals(resolved.lines, pallet) : null), [resolved, pallet])

  if (!order || !resolved || !totals) {
    return <><PageHeader title="Không thấy đơn" back={backHref} backLabel={backLabel} /><Page><Empty icon={<AlertTriangle size={28} strokeWidth={1.5} />} title="Đơn này không còn" body="Có thể đã bị xoá." /></Page></>
  }
  const save = (patch: Partial<Order>) => upsert({ ...order, ...patch })
  const setQty = (itemId: string, qty: number) => save({ lines: order.lines.map(l => (l.itemId === itemId ? { ...l, qty: Math.max(0, Math.round(qty)) } : l)) })
  const picked = new Set(order.lines.map(l => l.itemId))
  const toggle = (itemId: string) => save({
    lines: picked.has(itemId) ? order.lines.filter(l => l.itemId !== itemId) : [...order.lines, { itemId, qty: 0 }],
  })
  const trip = trips.find(t => t.orderIds.includes(order.id))
  const toTrip = () => {
    if (trip) { go({ page: 'trip', id: trip.id }); return }
    const tid = newId()
    upsertTrip({ id: tid, ...newTripLabel(trips), vehicleId: null, orderIds: [order.id], updatedAt: 0 })
    go({ page: 'trip', id: tid })
  }
  const byId = new Map(items.map(i => [i.id, i]))
  const zeroLines = order.lines.filter(l => !(l.qty > 0) && byId.has(l.itemId)).length

  return (
    <>
      <PageHeader title={order.name} subtitle={[order.place, trip && `Trong ${trip.name}`].filter(Boolean).join(' · ') || 'Đơn hàng'}
        back={backHref} backLabel={backLabel}
        actions={isSample(order.id) ? undefined : <IconButton label="Xoá đơn" onClick={() => setAskDel(true)}><Trash2 size={19} /></IconButton>} />
      <Page flush className="pb-32 lg:pb-28">
        <ListCard>
          <SectionBand title="Thông tin đơn" className="border-t-0 sm:rounded-t-[7px]" />
          <div className="grid grid-cols-2 gap-3 p-4">
            <Field label="Tên đơn"><TextInput value={order.name} onChange={e => save({ name: e.target.value })} /></Field>
            <Field label="Điểm giao"><TextInput value={order.place} onChange={e => save({ place: e.target.value })} placeholder="Cửa hàng / khách" /></Field>
          </div>

          <SectionBand title="Hàng trong đơn" meta={`· ${order.lines.length} mã`}
            right={!!order.lines.length && <Button variant="ghost" className="text-brand-700" onClick={() => setPicking(true)}><Plus size={17} />Thêm mã</Button>} />
          {!order.lines.length ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <ClipboardList size={28} strokeWidth={1.5} className="text-slate-500" />
              <h3 className="mt-3 text-base font-semibold text-slate-900">Đơn chưa có hàng</h3>
              <p className="mt-1 text-sm text-slate-600">Chọn các mã hàng rồi nhập số thùng.</p>
              <Button variant="primary" className="mt-5" onClick={() => setPicking(true)}><Plus size={18} />Chọn mã hàng</Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {order.lines.map(l => {
                const it = byId.get(l.itemId)
                if (!it) return (
                  <div key={l.itemId} className="flex items-center gap-3 px-4 py-3 text-sm text-red-700">
                    <AlertTriangle size={18} /><span className="flex-1">Mã hàng này đã bị xoá</span>
                    <IconButton label="Bỏ dòng" onClick={() => toggle(l.itemId)}><X size={18} /></IconButton>
                  </div>
                )
                return (
                  <div key={l.itemId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
                    <BoxGlyph w={it.w} h={it.h} light={it.light} />
                    <div className="min-w-0 flex-1 basis-40">
                      <div className="truncate text-[15px] font-semibold text-slate-900 sm:text-sm">{it.name}</div>
                      <div className="num truncate text-[13px] text-slate-600">{it.code} · {fmtDims(it.l, it.w, it.h)} mm{it.kg != null && ` · ${fmtDec(it.kg, 2)} kg`}</div>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <IconButton label="Bớt 1" onClick={() => setQty(l.itemId, l.qty - 1)} disabled={l.qty <= 0} className="border border-slate-300"><Minus size={16} /></IconButton>
                      <input inputMode="numeric" value={l.qty || ''} placeholder="Số thùng" aria-label={`Số thùng ${it.name}`}
                        onChange={e => setQty(l.itemId, Number(e.target.value.replace(/\D/g, '')) || 0)}
                        className={cx('tap num w-[84px] rounded-md border px-2 text-center text-base font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:text-sm',
                          l.qty > 0 ? 'border-slate-300' : 'border-amber-400 bg-amber-50 placeholder:text-[13px] placeholder:font-normal placeholder:text-amber-800')} />
                      <IconButton label="Thêm 1" onClick={() => setQty(l.itemId, l.qty + 1)} className="border border-slate-300"><Plus size={16} /></IconButton>
                      <IconButton label="Bỏ mã khỏi đơn" onClick={() => toggle(l.itemId)}><X size={18} /></IconButton>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {zeroLines > 0 && <p className="border-t border-slate-100 bg-amber-50 px-4 py-2 text-[13px] text-amber-800">{zeroLines} mã chưa nhập số thùng — chưa được tính.</p>}
        </ListCard>
      </Page>

      {/* dải tổng navy + đi xếp xe: dính đáy */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-20 bg-navy-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <div className="num grid flex-1 grid-cols-2 gap-x-4 gap-y-0.5 text-[13px] text-slate-300 sm:flex sm:gap-8">
            <span><b className="text-base font-semibold text-white">{fmtInt(totals.cartons)}</b> thùng</span>
            <span><b className="text-base font-semibold text-white">{fmtKgShort(totals.kg)}</b>{!totals.kgKnown && <span title="Có mã chưa khai kg">*</span>}</span>
            <span><b className="text-base font-semibold text-white">{fmtM3(totals.m3)}</b></span>
            <span>{totals.pallets != null ? <><b className="text-base font-semibold text-white">~{totals.pallets}</b> pallet</> : 'pallet: thiếu quy cách'}</span>
          </div>
          <Button variant="primary" onClick={toTrip} disabled={!totals.cartons}>
            {trip ? 'Xem chuyến' : 'Xếp lên xe'}<ArrowRight size={18} />
          </Button>
        </div>
      </div>

      <ItemPicker open={picking} onClose={() => setPicking(false)} picked={picked} onToggle={it => toggle(it.id)} />
      <Confirm open={askDel} onClose={() => setAskDel(false)} title={`Xoá ${order.name}?`}
        body={trip ? `Đơn sẽ được gỡ khỏi ${trip.name}.` : 'Không thể hoàn tác.'}
        onOk={() => { removeOrder(order.id); window.location.hash = backHref }} />
    </>
  )
}
