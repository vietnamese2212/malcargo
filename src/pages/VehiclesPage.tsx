import { useState } from 'react'
import { Plus, Truck } from 'lucide-react'
import { useAllVehicles } from '../data/store'
import { useAuth } from '../data/cloud'
import type { Vehicle } from '../data/types'
import { Badge, Button, Empty, ListFooter, ListHead, SummaryBand, Tabs, fmtDims, fmtInt, fmtKgShort, fmtM3 } from '../ui/kit'
import { ListCard, Page, PageHeader } from '../ui/Shell'
import { VehicleSheet } from '../ui/VehicleSheet'

const GRID = 'sm:grid-cols-[64px_minmax(0,1.4fr)_minmax(0,0.8fr)_96px_170px_80px_84px]'
const m3Of = (v: Vehicle) => (v.l * v.w * v.h) / 1e9

export default function VehiclesPage() {
  const all = useAllVehicles()
  const mine = all.filter(v => v.owner === 'me')
  const [tab, setTab] = useState<'me' | 'admin'>(mine.length ? 'me' : 'admin')
  const [edit, setEdit] = useState<{ v: Vehicle | null; sample?: boolean } | null>(null)
  const isAdmin = useAuth(s => s.isAdmin)
  const list = all.filter(v => v.owner === tab)
  return (
    <>
      <PageHeader title="Xe" subtitle="Lòng thùng, tải trọng, cách chở"
        actions={tab === 'admin' && isAdmin
          ? <Button variant="primary" aria-label="Thêm xe mẫu" onClick={() => setEdit({ v: null, sample: true })}><Plus size={18} /><span className="hidden sm:inline">Thêm xe mẫu</span></Button>
          : <Button variant="primary" aria-label="Thêm xe" onClick={() => setEdit({ v: null })}><Plus size={18} /><span className="hidden sm:inline">Thêm xe</span></Button>}>
        <Tabs value={tab} onChange={setTab} flush
          options={[{ value: 'me', label: `Xe của tôi · ${mine.length}` }, { value: 'admin', label: `Mẫu chung · ${all.length - mine.length}` }]} />
      </PageHeader>
      <Page flush={!(tab === 'me' && !mine.length)}>
        {tab === 'me' && !mine.length ? (
          <Empty icon={<Truck size={28} strokeWidth={1.5} />} title="Chưa có xe nào của bạn"
            body="Thêm xe với lòng thùng đo thật — mỗi nhà đóng thùng một khác, số đo thật cho sơ đồ đúng nhất. Hoặc sao một xe mẫu về để sửa."
            action={<Button variant="primary" onClick={() => setEdit({ v: null })}><Plus size={18} />Thêm xe</Button>} />
        ) : (
          <ListCard>
            <SummaryBand className="sm:rounded-t-[7px]" tiles={[
              { label: 'Xe', value: fmtInt(list.length) },
              { label: 'Thùng rời', value: fmtInt(list.filter(v => v.kind === 'loose').length) },
              { label: 'Xếp pallet', value: fmtInt(list.filter(v => v.kind === 'pallet').length) },
            ]} />
            <ListHead grid={GRID}>
              <span /><span>Xe</span><span>Biển số</span><span>Cách chở</span><span className="text-right">Lòng thùng (mm)</span>
              <span className="text-right">Thể tích</span><span className="text-right">Tải trọng</span>
            </ListHead>
            {list.map(v => (
              <button key={v.id} type="button" onClick={() => setEdit({ v })}
                className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-slate-50 sm:grid sm:min-h-[56px] sm:gap-4 sm:py-2 ${GRID}`}>
                <TruckGlyph pallet={v.kind === 'pallet'} />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[15px] font-semibold leading-snug text-slate-900 sm:text-sm">{v.name}</span>
                  <span className="num block text-[13px] leading-snug text-slate-600 sm:hidden">
                    {v.plate && `${v.plate} · `}<span className="whitespace-nowrap">{fmtDims(v.l, v.w, v.h)} mm</span>
                    {v.payloadKg != null && <> · <span className="whitespace-nowrap">{fmtKgShort(v.payloadKg)}</span></>}
                  </span>
                </span>
                <span className="hidden break-words text-sm text-slate-700 sm:block">{v.plate || <span className="text-slate-500">—</span>}</span>
                <span className="shrink-0"><KindBadge v={v} /></span>
                <span className="num hidden text-right text-sm text-slate-700 sm:block">{fmtDims(v.l, v.w, v.h)}</span>
                <span className="num hidden text-right text-sm text-slate-700 sm:block">{fmtM3(m3Of(v))}</span>
                <span className="num hidden text-right text-sm text-slate-700 sm:block">{v.payloadKg != null ? fmtKgShort(v.payloadKg) : <span className="text-slate-500">—</span>}</span>
              </button>
            ))}
            <ListFooter right={tab === 'admin' ? (isAdmin ? 'Bạn là admin: sửa mẫu chung, mọi người dùng thấy ngay' : 'Mẫu chung: bấm một xe để sửa, lưu lại thành xe của bạn') : undefined}>{list.length} xe</ListFooter>
          </ListCard>
        )}
      </Page>
      <VehicleSheet open={!!edit} vehicle={edit?.v ?? null} asSample={edit?.sample} onClose={() => setEdit(null)} onSaved={() => setTab('me')} />
    </>
  )
}

const KindBadge = ({ v }: { v: Vehicle }) => <Badge tone={v.kind === 'pallet' ? 'blue' : 'slate'}>{v.kind === 'pallet' ? 'Pallet' : 'Thùng rời'}</Badge>

export function TruckGlyph({ pallet, small }: { pallet?: boolean; small?: boolean }) {
  return (
    <svg viewBox="0 0 64 34" className={small ? 'h-5 w-9 shrink-0' : 'h-8 w-14 shrink-0'} aria-hidden>
      <rect x="1" y="3" width="42" height="22" rx="1.5" fill="#eef2f7" stroke="#8b9ab0" strokeWidth="1.5" />
      {pallet
        ? <><rect x="6" y="13" width="9" height="9" fill="#d8b98c" /><rect x="17" y="13" width="9" height="9" fill="#d8b98c" /><rect x="28" y="13" width="9" height="9" fill="#d8b98c" /><rect x="5" y="22" width="33" height="2" fill="#a9814f" /></>
        : <><rect x="5" y="11" width="7" height="12" fill="#d8b98c" /><rect x="13" y="8" width="7" height="15" fill="#c7a273" /><rect x="21" y="13" width="7" height="10" fill="#d8b98c" /></>}
      <path d="M44 9h9l7 8v8H44z" fill="#fff" stroke="#8b9ab0" strokeWidth="1.5" />
      <path d="M47 12h5l4 5h-9z" fill="#0b1424" />
      <circle cx="13" cy="28" r="4.5" fill="#1b1d20" /><circle cx="13" cy="28" r="1.8" fill="#c3c9d1" />
      <circle cx="51" cy="28" r="4.5" fill="#1b1d20" /><circle cx="51" cy="28" r="1.8" fill="#c3c9d1" />
    </svg>
  )
}
