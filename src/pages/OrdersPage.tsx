import { useMemo } from 'react'
import { ChevronRight, ClipboardList, Plus } from 'lucide-react'
import { newId, nextName, useAllItems, useData } from '../data/store'
import { resolveOrder } from '../data/resolve'
import { orderTotals } from '../engine/plan'
import { Button, Empty, ListFooter, ListHead, SummaryBand, fmtInt, fmtKgShort, fmtM3 } from '../ui/kit'
import { ListCard, Page, PageHeader } from '../ui/Shell'
import { go } from '../ui/route'

const GRID = 'sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_72px_88px_84px_64px_16px]'

export function useCreateOrder() {
  const orders = useData(s => s.orders)
  const upsert = useData(s => s.upsertOrder)
  return (back?: string) => {
    const id = newId()
    upsert({ id, name: nextName('Đơn', orders.map(o => o.name)), place: '', lines: [], updatedAt: 0 })
    go({ page: 'order', id, back })
    return id
  }
}

export default function OrdersPage() {
  const orders = useData(s => s.orders)
  const trips = useData(s => s.trips)
  const items = useAllItems()
  const pallet = useData(s => s.pallet)
  const create = useCreateOrder()
  const rows = useMemo(() => [...orders].sort((a, b) => b.updatedAt - a.updatedAt).map(o => {
    const r = resolveOrder(o, items)
    return { o, t: orderTotals(r.lines, pallet), trip: trips.find(t => t.orderIds.includes(o.id)) }
  }), [orders, items, pallet, trips])
  const sum = rows.reduce((s, r) => ({ cartons: s.cartons + r.t.cartons, kg: s.kg + r.t.kg }), { cartons: 0, kg: 0 })
  const loose = rows.filter(r => !r.trip).length

  return (
    <>
      <PageHeader title="Đơn hàng" subtitle="Mỗi đơn là một danh sách mã hàng và số thùng"
        actions={<Button variant="primary" aria-label="Tạo đơn" onClick={() => create()}><Plus size={18} /><span className="hidden sm:inline">Tạo đơn</span></Button>} />
      <Page flush={!!rows.length}>
        {!rows.length ? (
          <Empty icon={<ClipboardList size={28} strokeWidth={1.5} />} title="Chưa có đơn nào"
            body="Tạo đơn, chọn mã hàng và số thùng — app tính ngay khối lượng, thể tích, số pallet."
            action={<Button variant="primary" onClick={() => create()}><Plus size={18} />Tạo đơn đầu tiên</Button>} />
        ) : (
          <ListCard>
            <SummaryBand className="sm:rounded-t-[7px]" tiles={[
              { label: 'Đơn', value: fmtInt(rows.length) },
              { label: 'Chưa vào chuyến', value: fmtInt(loose) },
              { label: 'Tổng thùng', value: fmtInt(sum.cartons) },
              { label: 'Tổng khối lượng', value: fmtKgShort(sum.kg) },
            ]} />
            <ListHead grid={GRID}>
              <span>Đơn</span><span>Điểm giao</span><span>Chuyến</span><span className="text-right">Thùng</span>
              <span className="text-right">Khối lượng</span><span className="text-right">Thể tích</span><span className="text-right">Pallet</span><span />
            </ListHead>
            {rows.map(({ o, t, trip }) => (
              <a key={o.id} href={`#/order/${o.id}`}
                className={`group flex items-center gap-4 border-b border-slate-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-slate-50 sm:grid sm:min-h-[52px] sm:py-2 ${GRID}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-slate-900 sm:text-sm">{o.name}</span>
                  <span className="num block truncate text-[13px] text-slate-600 sm:hidden">
                    {[o.place, fmtKgShort(t.kg) + (t.kgKnown ? '' : '*'), fmtM3(t.m3), trip?.name].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="hidden truncate text-sm text-slate-700 sm:block">{o.place || <span className="text-slate-500">—</span>}</span>
                <span className="hidden truncate text-sm sm:block">{trip ? <span className="text-brand-700">{trip.name}</span> : <span className="text-slate-500">Chưa vào chuyến</span>}</span>
                <span className="num shrink-0 text-right text-sm font-semibold text-slate-900">
                  {fmtInt(t.cartons)}<span className="font-normal text-slate-600 sm:hidden"> thùng</span>
                </span>
                <span className="num hidden text-right text-sm text-slate-700 sm:block" title={t.kgKnown ? undefined : 'Có mã chưa khai kg'}>{fmtKgShort(t.kg)}{!t.kgKnown && '*'}</span>
                <span className="num hidden text-right text-sm text-slate-700 sm:block">{fmtM3(t.m3)}</span>
                <span className="num hidden text-right text-sm text-slate-700 sm:block">{t.pallets != null ? `~${t.pallets}` : <span className="text-slate-500">—</span>}</span>
                <ChevronRight size={16} className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
              </a>
            ))}
            <ListFooter right={rows.some(r => !r.t.kgKnown) ? '* có mã chưa khai kg — khối lượng thiếu' : undefined}>{rows.length} đơn</ListFooter>
          </ListCard>
        )}
      </Page>
    </>
  )
}
