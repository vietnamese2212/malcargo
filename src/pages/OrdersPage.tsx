import { useMemo } from 'react'
import { ChevronRight, ClipboardList, Plus } from 'lucide-react'
import { newId, nextName, useAllItems, useData } from '../data/store'
import { resolveOrder } from '../data/resolve'
import { orderTotals } from '../engine/plan'
import { Button, Empty, ListFooter, ListHead, SummaryBand, fmtInt, fmtKgShort, fmtM3 } from '../ui/kit'
import { ListCard, Page, PageHeader } from '../ui/Shell'
import { go } from '../ui/route'
import { t, tx } from '../i18n'

const GRID = 'sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_72px_88px_84px_64px_16px]'

export function useCreateOrder() {
  const orders = useData(s => s.orders)
  const upsert = useData(s => s.upsertOrder)
  return (back?: string) => {
    const id = newId()
    upsert({ id, name: nextName('Đơn', orders.map(o => o.name)), place: '', lines: [], updatedAt: 0 }) // i18n-ok tên mặc định lưu vào dữ liệu
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
      <PageHeader title={t('Đơn hàng')} subtitle={t('Mỗi đơn là một danh sách mã hàng và số thùng')}
        actions={<Button variant="primary" aria-label={t('Tạo đơn')} onClick={() => create()}><Plus size={18} /><span className="hidden sm:inline">{t('Tạo đơn')}</span></Button>} />
      <Page flush={!!rows.length}>
        {!rows.length ? (
          <Empty icon={<ClipboardList size={28} strokeWidth={1.5} />} title={t('Chưa có đơn nào')}
            body={t('Tạo đơn, chọn mã hàng và số thùng — app tính ngay khối lượng, thể tích, số pallet.')}
            action={<Button variant="primary" onClick={() => create()}><Plus size={18} />{t('Tạo đơn đầu tiên')}</Button>} />
        ) : (
          <ListCard>
            <SummaryBand className="sm:rounded-t-[7px]" tiles={[
              { label: t('Đơn'), value: fmtInt(rows.length) },
              { label: t('Chưa vào chuyến'), value: fmtInt(loose) },
              { label: t('Tổng thùng'), value: fmtInt(sum.cartons) },
              { label: t('Tổng khối lượng'), value: fmtKgShort(sum.kg) },
            ]} />
            <ListHead grid={GRID}>
              <span>{t('Đơn')}</span><span>{t('Điểm giao')}</span><span>{t('Chuyến')}</span><span className="text-right">{t('Thùng')}</span>
              <span className="text-right">{t('Khối lượng')}</span><span className="text-right">{t('Thể tích')}</span><span className="text-right">Pallet</span><span />
            </ListHead>
            {rows.map(({ o, t: tot, trip }) => (
              <a key={o.id} href={`#/order/${o.id}`}
                className={`group flex items-center gap-4 border-b border-slate-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-slate-50 sm:grid sm:min-h-[52px] sm:py-2 ${GRID}`}>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[15px] font-semibold leading-snug text-slate-900 sm:text-sm">{tx(o.name)}</span>
                  <span className="num block text-[13px] leading-snug text-slate-600 sm:hidden">
                    {[tx(o.place), fmtKgShort(tot.kg) + (tot.kgKnown ? '' : '*'), fmtM3(tot.m3), trip && tx(trip.name)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="hidden break-words text-sm text-slate-700 sm:block">{tx(o.place) || <span className="text-slate-500">—</span>}</span>
                <span className="hidden break-words text-sm sm:block">{trip ? <span className="text-brand-700">{tx(trip.name)}</span> : <span className="text-slate-500">{t('Chưa vào chuyến')}</span>}</span>
                <span className="num shrink-0 text-right text-sm font-semibold text-slate-900">
                  {fmtInt(tot.cartons)}<span className="font-normal text-slate-600 sm:hidden"> {t('{n:thùng|thùng}', { n: tot.cartons })}</span>
                </span>
                <span className="num hidden text-right text-sm text-slate-700 sm:block" title={tot.kgKnown ? undefined : t('Có mã chưa khai kg')}>{fmtKgShort(tot.kg)}{!tot.kgKnown && '*'}</span>
                <span className="num hidden text-right text-sm text-slate-700 sm:block">{fmtM3(tot.m3)}</span>
                <span className="num hidden text-right text-sm text-slate-700 sm:block">{tot.pallets != null ? `~${tot.pallets}` : <span className="text-slate-500">—</span>}</span>
                <ChevronRight size={16} className="shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
              </a>
            ))}
            <ListFooter right={rows.some(r => !r.t.kgKnown) ? t('* có mã chưa khai kg — khối lượng thiếu') : undefined}>{t('{n} đơn', { n: rows.length })}</ListFooter>
          </ListCard>
        )}
      </Page>
    </>
  )
}
