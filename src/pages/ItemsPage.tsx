import { useMemo, useState, type ReactNode } from 'react'
import { ClipboardPaste, Package, Plus } from 'lucide-react'
import { useAllItems } from '../data/store'
import { useAuth } from '../data/cloud'
import type { Item } from '../data/types'
import { Badge, BoxGlyph, Button, Empty, ListFooter, ListHead, SearchInput, SummaryBand, Tabs, fmtDec, fmtDims, fmtInt } from '../ui/kit'
import { ListCard, Page, PageHeader } from '../ui/Shell'
import { ItemSheet } from '../ui/ItemSheet'
import { ImportSheet } from '../ui/ImportSheet'

const GRID = 'sm:grid-cols-[32px_minmax(104px,0.7fr)_minmax(0,1.7fr)_140px_72px_84px_56px_80px]'

export default function ItemsPage() {
  const all = useAllItems()
  const [tab, setTab] = useState<'me' | 'admin'>(() => (all.some(i => i.owner === 'me') ? 'me' : 'admin'))
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<{ item: Item | null; sample?: boolean } | null>(null)
  const isAdmin = useAuth(s => s.isAdmin)
  const [paste, setPaste] = useState(false)
  const mine = all.filter(i => i.owner === 'me')
  const inTab = all.filter(i => i.owner === tab)
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return inTab.filter(i => !t || i.code.toLowerCase().includes(t) || i.name.toLowerCase().includes(t))
  }, [inTab, q])

  return (
    <>
      <PageHeader title="Mã hàng" subtitle="Kích thước thùng, khối lượng, cách xếp"
        actions={<>
          <Button className="hidden sm:inline-flex" onClick={() => setPaste(true)}><ClipboardPaste size={17} />Dán từ Excel</Button>
          {tab === 'admin' && isAdmin
            ? <Button variant="primary" aria-label="Thêm mã mẫu" onClick={() => setEdit({ item: null, sample: true })}><Plus size={18} /><span className="hidden sm:inline">Thêm mã mẫu</span></Button>
            : <Button variant="primary" aria-label="Thêm mã" onClick={() => setEdit({ item: null })}><Plus size={18} /><span className="hidden sm:inline">Thêm mã</span></Button>}
        </>}>
        <Tabs value={tab} onChange={setTab} flush
          options={[{ value: 'me', label: `Của tôi · ${mine.length}` }, { value: 'admin', label: `Mẫu chung · ${all.length - mine.length}` }]} />
      </PageHeader>
      <Page flush={!(tab === 'me' && !mine.length)}>
        {tab === 'me' && !mine.length ? (
          <Empty icon={<Package size={28} strokeWidth={1.5} />} title="Chưa có mã hàng nào của bạn"
            body="Thêm từng mã, dán cả danh sách từ Excel, hoặc mở tab Mẫu chung và sao một mẫu về để sửa."
            action={<div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => setEdit({ item: null })}><Plus size={18} />Thêm mã hàng</Button>
              <Button onClick={() => setPaste(true)}><ClipboardPaste size={17} />Dán từ Excel</Button>
            </div>} />
        ) : (
          <ListCard>
            <SummaryBand className="sm:rounded-t-[7px]" tiles={[
              { label: 'Mã hàng', value: fmtInt(list.length) },
              { label: 'Hàng nhẹ', value: fmtInt(list.filter(i => i.light).length) },
              { label: 'Chưa khai kg', value: fmtInt(list.filter(i => i.kg == null).length), tone: list.some(i => i.kg == null) ? 'warn' : undefined },
              { label: 'Chưa có thùng/pallet', value: fmtInt(list.filter(i => i.perPallet == null).length) },
            ]} />
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5">
              <SearchInput className="min-w-0 flex-1 sm:max-w-xs" placeholder="Tìm theo mã hoặc tên" value={q} onChange={e => setQ(e.target.value)} aria-label="Tìm mã hàng" />
              <Button className="sm:hidden" onClick={() => setPaste(true)} aria-label="Dán từ Excel"><ClipboardPaste size={17} />Dán</Button>
            </div>
            {!list.length ? (
              <p className="px-4 py-8 text-sm text-slate-600">Không có mã nào khớp “{q}”.</p>
            ) : (
              <>
                <ListHead grid={GRID}>
                  <span /><span>Mã</span><span>Tên hàng</span><span className="text-right">Thùng (mm)</span><span className="text-right">kg/thùng</span>
                  <span className="text-right">Thùng/pallet</span><span className="text-right">Chồng</span><span />
                </ListHead>
                {list.map(i => (
                  <button key={i.id} type="button" onClick={() => setEdit({ item: i })}
                    className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-slate-50 sm:grid sm:min-h-[52px] sm:gap-4 sm:py-2 ${GRID}`}>
                    <BoxGlyph w={i.w} h={i.h} light={i.light} />
                    <span className="hidden truncate text-sm font-medium text-slate-700 sm:block">{i.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-slate-900 sm:text-sm">{i.name}</span>
                      <span className="num block truncate text-[13px] text-slate-600 sm:hidden">
                        {i.code} · {fmtDims(i.l, i.w, i.h)} mm{i.kg != null && ` · ${fmtDec(i.kg, 2)} kg`}
                      </span>
                    </span>
                    <span className="num hidden text-right text-sm text-slate-700 sm:block">{fmtDims(i.l, i.w, i.h)}</span>
                    <Num v={i.kg == null ? null : fmtDec(i.kg, 2)} />
                    <Num v={i.perPallet == null ? null : fmtInt(i.perPallet)} />
                    <Num v={i.maxLayers == null ? null : `≤ ${i.maxLayers}`} />
                    <span className="shrink-0 text-right">{i.light && <Badge tone="amber">Hàng nhẹ</Badge>}</span>
                  </button>
                ))}
              </>
            )}
            <ListFooter right={tab === 'admin' ? (isAdmin ? 'Bạn là admin: sửa mẫu chung, mọi người dùng thấy ngay' : 'Mẫu chung: bấm một mã để sửa, lưu lại thành mã của bạn') : undefined}>{list.length} / {inTab.length} mã</ListFooter>
          </ListCard>
        )}
      </Page>
      <ItemSheet open={!!edit} item={edit?.item ?? null} asSample={edit?.sample} onClose={() => setEdit(null)} onSaved={() => setTab('me')} />
      <ImportSheet open={paste} start="items" onClose={() => { setPaste(false); setTab('me') }} />
    </>
  )
}

const Num = ({ v }: { v: string | null }) =>
  <span className="num hidden text-right text-sm text-slate-700 sm:block">{v ?? <span className="text-slate-500">—</span>}</span>

/** Một dòng mã hàng trong danh sách chọn (chọn mã cho đơn, xem trước khi dán). */
export function ItemRow({ item: i, onClick, right }: { item: Item; onClick?: () => void; right?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50">
      <BoxGlyph w={i.w} h={i.h} light={i.light} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-slate-900 sm:text-sm">{i.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-600">
          <span className="font-medium text-slate-700">{i.code}</span>
          <span className="num">{fmtDims(i.l, i.w, i.h)} mm</span>
          {i.kg != null && <span className="num">{fmtDec(i.kg, 2)} kg</span>}
          {i.light && <Badge tone="amber">Hàng nhẹ</Badge>}
          {i.maxLayers != null && <Badge>≤ {i.maxLayers} lớp</Badge>}
          {i.perPallet != null && <Badge>{i.perPallet}/pallet</Badge>}
        </div>
      </div>
      {right}
    </button>
  )
}
