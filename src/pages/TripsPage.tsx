import { useMemo, useState } from 'react'
import { Boxes, ChevronRight, Plus } from 'lucide-react'
import { findVehicle, isSample, newId, newTripLabel, useAllItems, useAllVehicles, useData } from '../data/store'
import { resolveOrder } from '../data/resolve'
import { orderTotals } from '../engine/plan'
import { Button, Confirm, Empty, ListFooter, ListHead, RowCheck, SelectBar, SummaryBand, cx, fmtInt, fmtKgShort, fmtM3, useSelection } from '../ui/kit'
import { ListCard, Page, PageHeader, usePanel } from '../ui/Shell'
import { go, useRoute } from '../ui/route'
import { t, tx } from '../i18n'

const GRID = 'sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_48px_72px_88px_84px_16px]'

export default function TripsPage() {
  const trips = useData(s => s.trips)
  const orders = useData(s => s.orders)
  const pallet = useData(s => s.pallet)
  const upsertTrip = useData(s => s.upsertTrip)
  const items = useAllItems()
  const vehicles = useAllVehicles()
  const panel = usePanel()
  const route = useRoute()
  const rows = useMemo(() => [...trips].sort((a, b) => b.updatedAt - a.updatedAt).map(t => {
    const os = t.orderIds.map(id => orders.find(o => o.id === id)).filter(Boolean).map(o => resolveOrder(o!, items))
    return { t, v: findVehicle(vehicles, t.vehicleId), n: os.length, tot: orderTotals(os.flatMap(o => o.lines), pallet) }
  }), [trips, orders, items, vehicles, pallet])
  const sum = rows.reduce((s, r) => ({ cartons: s.cartons + r.tot.cartons, kg: s.kg + r.tot.kg }), { cartons: 0, kg: 0 })
  const noVehicle = rows.filter(r => !r.v).length
  // chọn nhiều để xoá (chuyến mẫu không xoá được); xoá luôn các đơn chỉ nằm trong những chuyến đã chọn
  const ids = rows.map(r => r.t.id).filter(id => !isSample(id))
  const sel = useSelection(ids)
  const [askDel, setAskDel] = useState(false)
  const [withOrders, setWithOrders] = useState(true)
  const removeTrip = useData(s => s.removeTrip)
  const removeOrder = useData(s => s.removeOrder)
  const ownOrders = useMemo(() => {
    const picked = new Set(sel.ids)
    const elsewhere = new Set(trips.filter(t => !picked.has(t.id)).flatMap(t => t.orderIds))
    return [...new Set(trips.filter(t => picked.has(t.id)).flatMap(t => t.orderIds))]
      .filter(o => !isSample(o) && !elsewhere.has(o) && orders.some(x => x.id === o))
  }, [sel.ids, trips, orders])
  const removeSelected = () => {
    const cur = route.page === 'trip' && sel.ids.includes(route.id)
    sel.ids.forEach(removeTrip)
    if (withOrders) ownOrders.forEach(removeOrder)
    sel.clear()
    if (cur) go({ page: 'trips' })   // vừa xoá chuyến đang mở ⇒ về chuyến sửa gần nhất
  }

  const create = () => {
    const id = newId()
    upsertTrip({ id, ...newTripLabel(trips), vehicleId: null, orderIds: [], updatedAt: 0 })
    go({ page: 'trip', id })
  }

  return (
    <>
      <PageHeader title={t('Các chuyến')} subtitle={t('Bấm một chuyến để mở trên bàn xếp xe')}
        actions={<Button variant="primary" aria-label={t('Tạo chuyến')} onClick={create}><Plus size={18} /><span className="hidden sm:inline">{t('Tạo chuyến')}</span></Button>} />
      <Page flush={!!rows.length}>
        {!rows.length ? (
          <Empty icon={<Boxes size={28} strokeWidth={1.5} />} title={t('Chưa có chuyến nào')}
            body={t('Tạo một chuyến, thêm đơn hàng vào — app chọn xe vừa nhất và vẽ sơ đồ xếp.')}
            action={<Button variant="primary" onClick={create}><Plus size={18} />{t('Tạo chuyến')}</Button>} />
        ) : (
          <ListCard>
            <SummaryBand className="sm:rounded-t-[7px]" tiles={[
              { label: t('Chuyến'), value: fmtInt(rows.length) },
              { label: t('Chưa chọn xe'), value: fmtInt(noVehicle), tone: noVehicle ? 'warn' : undefined },
              { label: t('Tổng thùng'), value: fmtInt(sum.cartons) },
              { label: t('Tổng khối lượng'), value: fmtKgShort(sum.kg) },
            ]} />
            <ListHead grid={GRID} check={ids.length ? <RowCheck checked={sel.all} mixed={sel.some} onChange={sel.toggleAll} label={t('Chọn tất cả')} /> : <span className="w-11 shrink-0" />}>
              <span>{t('Chuyến')}</span><span>{t('Xe')}</span><span className="text-right">{t('Đơn')}</span><span className="text-right">{t('Thùng')}</span>
              <span className="text-right">{t('Khối lượng')}</span><span className="text-right">{t('Thể tích')}</span><span />
            </ListHead>
            {rows.map(({ t: trip, v, n, tot }) => (
              <div key={trip.id} className={cx('flex border-b border-slate-100 last:border-b-0', sel.has(trip.id) && 'bg-brand-50')}>
                {/* chuyến mẫu không xoá được — chừa chỗ cho thẳng cột */}
                {isSample(trip.id) ? <span className="w-11 shrink-0" /> : <RowCheck checked={sel.has(trip.id)} onChange={() => sel.toggle(trip.id)} label={t('Chọn {name}', { name: tx(trip.name) })} />}
                <a href={`#/trip/${trip.id}`} onClick={() => panel?.close()}
                  className={`group flex min-w-0 flex-1 items-center gap-4 py-3 pr-4 transition-colors hover:bg-slate-50 sm:grid sm:min-h-[52px] sm:py-2 ${GRID}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[15px] font-semibold leading-snug text-slate-900 sm:text-sm">{tx(trip.name)}</span>
                    <span className="num block text-[13px] leading-snug text-slate-600 sm:hidden">
                      {v ? tx(v.name) : t('Chưa chọn xe')} · {t('{n} đơn', { n })} · {fmtKgShort(tot.kg)} · {fmtM3(tot.m3)}
                    </span>
                  </span>
                  <span className={`hidden break-words text-sm sm:block ${v ? 'text-slate-700' : 'text-amber-700'}`}>{v ? tx(v.name) : t('Chưa chọn xe')}</span>
                  <span className="num hidden text-right text-sm text-slate-700 sm:block">{n}</span>
                  <span className="num shrink-0 text-right text-sm font-semibold text-slate-900">
                    {fmtInt(tot.cartons)}<span className="font-normal text-slate-600 sm:hidden"> {t('{n:thùng|thùng}', { n: tot.cartons })}</span>
                  </span>
                  <span className="num hidden text-right text-sm text-slate-700 sm:block">{fmtKgShort(tot.kg)}</span>
                  <span className="num hidden text-right text-sm text-slate-700 sm:block">{fmtM3(tot.m3)}</span>
                  <ChevronRight size={16} className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                </a>
              </div>
            ))}
            <ListFooter>{t('{n} chuyến', { n: rows.length })}</ListFooter>
            <SelectBar n={sel.ids.length} total={ids.length} all={sel.all} onAll={sel.toggleAll} onClear={sel.clear} onDelete={() => { setWithOrders(true); setAskDel(true) }} />
          </ListCard>
        )}
      </Page>
      <Confirm open={askDel} onClose={() => setAskDel(false)} title={t('Xoá {n} chuyến?', { n: fmtInt(sel.ids.length) })}
        body={ownOrders.length ? (
          <label className="tap -mx-1 mt-1 flex cursor-pointer items-center gap-3 rounded-md px-1 hover:bg-slate-50">
            <input type="checkbox" checked={withOrders} onChange={e => setWithOrders(e.target.checked)} className="h-[18px] w-[18px] shrink-0 accent-brand-500" />
            <span>{t('Xoá luôn {n} đơn của các chuyến này', { n: fmtInt(ownOrders.length) })}</span>
          </label>
        ) : t('Không thể hoàn tác.')}
        onOk={removeSelected} />
    </>
  )
}
