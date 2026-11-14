import { useMemo, useState } from 'react'
import { Boxes, ChevronRight, Plus } from 'lucide-react'
import { useHideSamples } from '../data/cloud'
import { denyEdit, findVehicle, isSample, newId, newTripLabel, tripTime, tripTitle, tripsByDay, useAllItems, useAllVehicles, useData } from '../data/store'
import { resolveOrder } from '../data/resolve'
import { orderTotals } from '../engine/plan'
import { Button, Confirm, DayHead, Empty, ListFooter, ListHead, RowCheck, SelectBar, SummaryBand, cx, fmtDate, fmtInt, fmtKgOf, fmtKgShort, fmtM3, fmtTime, useFold, useSelection } from '../ui/kit'
import { ListCard, Page, PageHeader, usePanel } from '../ui/Shell'
import { go, useRoute } from '../ui/route'
import { t, tx } from '../i18n'

const GRID = 'sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_48px_72px_88px_84px_16px]'

export default function TripsPage() {
  const allTrips = useData(s => s.trips)
  const hideSamples = useHideSamples()   // Family đã ẩn dữ liệu mẫu
  const trips = useMemo(() => (hideSamples ? allTrips.filter(x => !isSample(x.id)) : allTrips), [allTrips, hideSamples])
  const orders = useData(s => s.orders)
  const pallet = useData(s => s.pallet)
  const upsertTrip = useData(s => s.upsertTrip)
  const items = useAllItems()
  const vehicles = useAllVehicles()
  const panel = usePanel()
  const route = useRoute()
  // chủ dự án 14/11: "trong phần chuyến để dữ liệu theo ngày" ⇒ gom theo NGÀY tạo, mỗi ngày một dòng đầu (số chuyến, thùng, tấn)
  const days = useMemo(() => tripsByDay(trips.map(t => {
    const os = t.orderIds.map(id => orders.find(o => o.id === id)).filter(Boolean).map(o => resolveOrder(o!, items))
    const tm = tripTime(t)
    return { t, v: findVehicle(vehicles, t.vehicleId), n: os.length, tot: orderTotals(os.flatMap(o => o.lines), pallet), made: tm.exact ? fmtTime(tm.at) : null }
  }), r => r.t), [trips, orders, items, vehicles, pallet])
  const rows = useMemo(() => days.flatMap(g => g.rows), [days])
  // chủ dự án 14/11: "ngày mở ra dạng expand, ngày tháng năm" ⇒ mỗi ngày một dòng gập (tổng chuyến · thùng · tấn);
  // mở sẵn ngày mới nhất + ngày của chuyến đang mở
  const dayKey = (d: number | null) => String(d ?? 'mau')
  const fold = useFold([dayKey(days[0]?.day ?? null), dayKey(days.find(g => route.page === 'trip' && g.rows.some(r => r.t.id === route.id))?.day ?? null)])
  // dải tổng chỉ tính chuyến của người dùng — 2 chuyến mẫu (5.790 thùng / 40 tấn) từng làm tổng phình ra (thử 14/11)
  const own = rows.filter(r => !isSample(r.t.id))
  const sum = own.reduce((s, r) => ({ cartons: s.cartons + r.tot.cartons, kg: s.kg + r.tot.kg, known: s.known && r.tot.kgKnown }), { cartons: 0, kg: 0, known: true })
  const noVehicle = own.filter(r => !r.v).length
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
    if (denyEdit()) return
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
              { label: t('Chuyến'), value: fmtInt(own.length) },
              { label: t('Chưa chọn xe'), value: fmtInt(noVehicle), tone: noVehicle ? 'warn' : undefined },
              { label: t('Tổng thùng'), value: fmtInt(sum.cartons) },
              { label: t('Tổng khối lượng'), value: `${sum.known ? '' : '≥'}${fmtKgShort(sum.kg)}` },
            ]} />
            <ListHead grid={GRID} check={ids.length ? <RowCheck checked={sel.all} mixed={sel.some} onChange={sel.toggleAll} label={t('Chọn tất cả')} /> : <span className="w-11 shrink-0" />}>
              <span>{t('Chuyến')}</span><span>{t('Xe')}</span><span className="text-right">{t('Đơn')}</span><span className="text-right">{t('Thùng')}</span>
              <span className="text-right">{t('Khối lượng')}</span><span className="text-right">{t('Thể tích')}</span><span />
            </ListHead>
            {days.map(g => {
              const k = dayKey(g.day), open = fold.isOpen(k)
              return (
              <section key={k} aria-label={g.day == null ? t('Chuyến mẫu có sẵn') : fmtDate(g.day)}>
                <DayHead day={g.day} open={open} onToggle={() => fold.toggle(k)} className="pl-3.5 pr-4">
                  {t('{n} chuyến', { n: fmtInt(g.rows.length) })} · <span className="whitespace-nowrap">{t('{n} thùng', { n: fmtInt(g.rows.reduce((a, r) => a + r.tot.cartons, 0)) })}</span> · <span className="whitespace-nowrap">{fmtKgShort(g.rows.reduce((a, r) => a + r.tot.kg, 0))}</span>
                </DayHead>
            {open && g.rows.map(({ t: trip, v, n, tot, made }) => (
              <div key={trip.id} className={cx('flex border-b border-slate-100', sel.has(trip.id) && 'bg-brand-50')}>
                {/* chuyến mẫu không xoá được — chừa chỗ cho thẳng cột */}
                {isSample(trip.id) ? <span className="w-11 shrink-0" /> : <RowCheck checked={sel.has(trip.id)} onChange={() => sel.toggle(trip.id)} label={t('Chọn {name}', { name: tripTitle(trip, orders) })} />}
                <a href={`#/trip/${trip.id}`} onClick={() => panel?.close()}
                  className={`group flex min-w-0 flex-1 items-center gap-4 py-3 pr-4 transition-colors hover:bg-slate-50 sm:grid sm:min-h-[52px] sm:py-2 ${GRID}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[15px] font-semibold leading-snug text-slate-900 sm:text-sm">{tripTitle(trip, orders)}</span>
                    {made && <span className="num hidden text-[12px] text-slate-600 sm:block">{made}</span>}
                    <span className="num block text-[13px] leading-snug text-slate-600 sm:hidden">
                      {v ? tx(v.name) : t('Chưa chọn xe')} · {t('{n} đơn', { n })} · <span className="whitespace-nowrap">{fmtKgOf(tot)}</span> · <span className="whitespace-nowrap">{fmtM3(tot.m3)}</span>{made && <> · <span className="whitespace-nowrap">{made}</span></>}
                    </span>
                  </span>
                  <span className={`hidden break-words text-sm sm:block ${v ? 'text-slate-700' : 'text-amber-700'}`}>{v ? tx(v.name) : t('Chưa chọn xe')}</span>
                  <span className="num hidden text-right text-sm text-slate-700 sm:block">{n}</span>
                  <span className="num shrink-0 text-right text-sm font-semibold text-slate-900">
                    {fmtInt(tot.cartons)}<span className="font-normal text-slate-600 sm:hidden"> {t('{n:thùng|thùng}', { n: tot.cartons })}</span>
                  </span>
                  <span className="num hidden text-right text-sm text-slate-700 sm:block">{fmtKgOf(tot)}</span>
                  <span className="num hidden text-right text-sm text-slate-700 sm:block">{fmtM3(tot.m3)}</span>
                  <ChevronRight size={16} className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                </a>
              </div>
            ))}
              </section>
              )
            })}
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
