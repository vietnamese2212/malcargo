import { useMemo } from 'react'
import { Boxes, ChevronRight, Plus } from 'lucide-react'
import { findVehicle, newId, newTripLabel, useAllItems, useAllVehicles, useData } from '../data/store'
import { resolveOrder } from '../data/resolve'
import { orderTotals } from '../engine/plan'
import { Button, Empty, ListFooter, ListHead, SummaryBand, fmtInt, fmtKgShort, fmtM3 } from '../ui/kit'
import { ListCard, Page, PageHeader, usePanel } from '../ui/Shell'
import { go } from '../ui/route'

const GRID = 'sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_48px_72px_88px_84px_16px]'

export default function TripsPage() {
  const trips = useData(s => s.trips)
  const orders = useData(s => s.orders)
  const pallet = useData(s => s.pallet)
  const upsertTrip = useData(s => s.upsertTrip)
  const items = useAllItems()
  const vehicles = useAllVehicles()
  const panel = usePanel()
  const rows = useMemo(() => [...trips].sort((a, b) => b.updatedAt - a.updatedAt).map(t => {
    const os = t.orderIds.map(id => orders.find(o => o.id === id)).filter(Boolean).map(o => resolveOrder(o!, items))
    return { t, v: findVehicle(vehicles, t.vehicleId), n: os.length, tot: orderTotals(os.flatMap(o => o.lines), pallet) }
  }), [trips, orders, items, vehicles, pallet])
  const sum = rows.reduce((s, r) => ({ cartons: s.cartons + r.tot.cartons, kg: s.kg + r.tot.kg }), { cartons: 0, kg: 0 })
  const noVehicle = rows.filter(r => !r.v).length

  const create = () => {
    const id = newId()
    upsertTrip({ id, ...newTripLabel(trips), vehicleId: null, orderIds: [], updatedAt: 0 })
    go({ page: 'trip', id })
  }

  return (
    <>
      <PageHeader title="Các chuyến" subtitle="Bấm một chuyến để mở trên bàn xếp xe"
        actions={<Button variant="primary" aria-label="Tạo chuyến" onClick={create}><Plus size={18} /><span className="hidden sm:inline">Tạo chuyến</span></Button>} />
      <Page flush={!!rows.length}>
        {!rows.length ? (
          <Empty icon={<Boxes size={28} strokeWidth={1.5} />} title="Chưa có chuyến nào"
            body="Tạo một chuyến, thêm đơn hàng vào — app chọn xe vừa nhất và vẽ sơ đồ xếp."
            action={<Button variant="primary" onClick={create}><Plus size={18} />Tạo chuyến</Button>} />
        ) : (
          <ListCard>
            <SummaryBand className="sm:rounded-t-[7px]" tiles={[
              { label: 'Chuyến', value: fmtInt(rows.length) },
              { label: 'Chưa chọn xe', value: fmtInt(noVehicle), tone: noVehicle ? 'warn' : undefined },
              { label: 'Tổng thùng', value: fmtInt(sum.cartons) },
              { label: 'Tổng khối lượng', value: fmtKgShort(sum.kg) },
            ]} />
            <ListHead grid={GRID}>
              <span>Chuyến</span><span>Xe</span><span className="text-right">Đơn</span><span className="text-right">Thùng</span>
              <span className="text-right">Khối lượng</span><span className="text-right">Thể tích</span><span />
            </ListHead>
            {rows.map(({ t, v, n, tot }) => (
              <a key={t.id} href={`#/trip/${t.id}`} onClick={() => panel?.close()}
                className={`group flex items-center gap-4 border-b border-slate-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-slate-50 sm:grid sm:min-h-[52px] sm:py-2 ${GRID}`}>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[15px] font-semibold leading-snug text-slate-900 sm:text-sm">{t.name}</span>
                  <span className="num block text-[13px] leading-snug text-slate-600 sm:hidden">
                    {v ? v.name : 'Chưa chọn xe'} · {n} đơn · {fmtKgShort(tot.kg)} · {fmtM3(tot.m3)}
                  </span>
                </span>
                <span className={`hidden break-words text-sm sm:block ${v ? 'text-slate-700' : 'text-amber-700'}`}>{v ? v.name : 'Chưa chọn xe'}</span>
                <span className="num hidden text-right text-sm text-slate-700 sm:block">{n}</span>
                <span className="num shrink-0 text-right text-sm font-semibold text-slate-900">
                  {fmtInt(tot.cartons)}<span className="font-normal text-slate-600 sm:hidden"> thùng</span>
                </span>
                <span className="num hidden text-right text-sm text-slate-700 sm:block">{fmtKgShort(tot.kg)}</span>
                <span className="num hidden text-right text-sm text-slate-700 sm:block">{fmtM3(tot.m3)}</span>
                <ChevronRight size={16} className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
              </a>
            ))}
            <ListFooter>{rows.length} chuyến</ListFooter>
          </ListCard>
        )}
      </Page>
    </>
  )
}
