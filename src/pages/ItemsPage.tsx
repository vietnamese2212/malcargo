import { useMemo, useState, type ReactNode } from 'react'
import { ClipboardPaste, Package, Plus } from 'lucide-react'
import { useAllItems, useData } from '../data/store'
import { useAuth } from '../data/cloud'
import type { Item } from '../data/types'
import { Badge, BoxGlyph, Button, Confirm, Empty, ListFooter, ListHead, RowCheck, SearchInput, SelectBar, SummaryBand, Tabs, cx, fmtDec, fmtDims, fmtInt, useSelection } from '../ui/kit'
import { ListCard, Page, PageHeader } from '../ui/Shell'
import { ItemSheet } from '../ui/ItemSheet'
import { ImportSheet } from '../ui/ImportSheet'
import { t, tx } from '../i18n'

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
    const k = q.trim().toLowerCase()
    // tìm cả tên đang hiện (tên mẫu đã dịch) lẫn tên gốc
    return inTab.filter(i => !k || i.code.toLowerCase().includes(k) || i.name.toLowerCase().includes(k) || tx(i.name).toLowerCase().includes(k))
  }, [inTab, q])
  // chọn nhiều để xoá: chỉ mã của tôi (mẫu chung người dùng không xoá được); chọn theo danh sách đang lọc
  const canSel = tab === 'me'
  const sel = useSelection(canSel ? list.map(i => i.id) : [])
  const [askDel, setAskDel] = useState(false)
  const remove = useData(s => s.removeItem)
  const orders = useData(s => s.orders)
  const usedIn = sel.ids.filter(id => orders.some(o => o.lines.some(l => l.itemId === id))).length

  return (
    <>
      <PageHeader title={t('Mã hàng')} subtitle={t('Kích thước thùng, khối lượng, cách xếp')}
        actions={<>
          <Button className="hidden sm:inline-flex" onClick={() => setPaste(true)}><ClipboardPaste size={17} />{t('Dán từ Excel')}</Button>
          {tab === 'admin' && isAdmin
            ? <Button variant="primary" aria-label={t('Thêm mã mẫu')} onClick={() => setEdit({ item: null, sample: true })}><Plus size={18} /><span className="hidden sm:inline">{t('Thêm mã mẫu')}</span></Button>
            : <Button variant="primary" aria-label={t('Thêm mã')} onClick={() => setEdit({ item: null })}><Plus size={18} /><span className="hidden sm:inline">{t('Thêm mã')}</span></Button>}
        </>}>
        <Tabs value={tab} onChange={setTab} flush
          options={[{ value: 'me', label: t('Của tôi · {n}', { n: mine.length }) }, { value: 'admin', label: t('Mẫu chung · {n}', { n: all.length - mine.length }) }]} />
      </PageHeader>
      <Page flush={!(tab === 'me' && !mine.length)}>
        {tab === 'me' && !mine.length ? (
          <Empty icon={<Package size={28} strokeWidth={1.5} />} title={t('Chưa có mã hàng nào của bạn')}
            body={t('Thêm từng mã, dán cả danh sách từ Excel, hoặc mở tab Mẫu chung và sao một mẫu về để sửa.')}
            action={<div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => setEdit({ item: null })}><Plus size={18} />{t('Thêm mã hàng')}</Button>
              <Button onClick={() => setPaste(true)}><ClipboardPaste size={17} />{t('Dán từ Excel')}</Button>
            </div>} />
        ) : (
          <ListCard>
            <SummaryBand className="sm:rounded-t-[7px]" tiles={[
              { label: t('Mã hàng'), value: fmtInt(list.length) },
              { label: t('Hàng nhẹ'), value: fmtInt(list.filter(i => i.light).length) },
              { label: t('Chưa khai kg'), value: fmtInt(list.filter(i => i.kg == null).length), tone: list.some(i => i.kg == null) ? 'warn' : undefined },
              { label: t('Chưa có thùng/pallet'), value: fmtInt(list.filter(i => i.perPallet == null).length) },
            ]} />
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5">
              <SearchInput className="min-w-0 flex-1 sm:max-w-xs" placeholder={t('Tìm theo mã hoặc tên')} value={q} onChange={e => setQ(e.target.value)} aria-label={t('Tìm mã hàng')} />
              <Button className="sm:hidden" onClick={() => setPaste(true)} aria-label={t('Dán từ Excel')}><ClipboardPaste size={17} />{t('Dán')}</Button>
            </div>
            {!list.length ? (
              <p className="px-4 py-8 text-sm text-slate-600">{t('Không có mã nào khớp “{q}”.', { q })}</p>
            ) : (
              <>
                <ListHead grid={GRID} check={canSel ? <RowCheck checked={sel.all} mixed={sel.some} onChange={sel.toggleAll} label={t('Chọn tất cả')} /> : undefined}>
                  <span /><span>{t('Mã')}</span><span>{t('Tên hàng')}</span><span className="text-right">{t('Thùng (mm)')}</span><span className="text-right">{t('kg/thùng')}</span>
                  <span className="text-right">{t('Thùng/pallet')}</span><span className="text-right">{t('Chồng')}</span><span />
                </ListHead>
                {list.map(i => (
                  <div key={i.id} className={cx('flex border-b border-slate-100 last:border-b-0', sel.has(i.id) && 'bg-brand-50')}>
                    {canSel && <RowCheck checked={sel.has(i.id)} onChange={() => sel.toggle(i.id)} label={t('Chọn {name}', { name: tx(i.name) })} />}
                    <button type="button" onClick={() => setEdit({ item: i })}
                      className={cx('flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 text-left transition-colors hover:bg-slate-50 sm:grid sm:min-h-[52px] sm:gap-4 sm:py-2', !canSel && 'pl-4', GRID)}>
                      <BoxGlyph w={i.w} h={i.h} light={i.light} />
                      <span className="hidden break-words text-sm font-medium text-slate-700 sm:block">{i.code}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-[15px] font-semibold leading-snug text-slate-900 sm:text-sm">{tx(i.name)}</span>
                        <span className="num block text-[13px] leading-snug text-slate-600 sm:hidden">
                          {i.code} · <span className="whitespace-nowrap">{fmtDims(i.l, i.w, i.h)} mm</span>
                          {i.kg != null && <> · <span className="whitespace-nowrap">{fmtDec(i.kg, 2)} kg</span></>}
                        </span>
                      </span>
                      <span className="num hidden text-right text-sm text-slate-700 sm:block">{fmtDims(i.l, i.w, i.h)}</span>
                      <Num v={i.kg == null ? null : fmtDec(i.kg, 2)} />
                      <Num v={i.perPallet == null ? null : fmtInt(i.perPallet)} />
                      <Num v={i.maxLayers == null ? null : `≤ ${i.maxLayers}`} />
                      <span className="shrink-0 text-right">{i.light && <Badge tone="amber">{t('Hàng nhẹ')}</Badge>}</span>
                    </button>
                  </div>
                ))}
              </>
            )}
            <ListFooter right={tab === 'admin' ? (isAdmin ? t('Bạn là admin: sửa mẫu chung, mọi người dùng thấy ngay') : t('Mẫu chung: bấm một mã để sửa, lưu lại thành mã của bạn')) : undefined}>{t('{n} / {total} mã', { n: list.length, total: inTab.length })}</ListFooter>
            <SelectBar n={sel.ids.length} total={list.length} all={sel.all} onAll={sel.toggleAll} onClear={sel.clear} onDelete={() => setAskDel(true)} />
          </ListCard>
        )}
      </Page>
      <Confirm open={askDel} onClose={() => setAskDel(false)} title={t('Xoá {n} mã hàng?', { n: fmtInt(sel.ids.length) })}
        body={usedIn ? t('{n} mã đang có trong đơn — các dòng đó sẽ báo thiếu mã.', { n: fmtInt(usedIn) }) : t('Không thể hoàn tác.')}
        onOk={() => { sel.ids.forEach(remove); sel.clear() }} />
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
        <div className="break-words text-[15px] font-semibold leading-snug text-slate-900 sm:text-sm">{tx(i.name)}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-600">
          <span className="font-medium text-slate-700">{i.code}</span>
          <span className="num">{fmtDims(i.l, i.w, i.h)} mm</span>
          {i.kg != null && <span className="num">{fmtDec(i.kg, 2)} kg</span>}
          {i.light && <Badge tone="amber">{t('Hàng nhẹ')}</Badge>}
          {i.maxLayers != null && <Badge>{t('≤ {n} lớp', { n: i.maxLayers })}</Badge>}
          {i.perPallet != null && <Badge>{i.perPallet}/pallet</Badge>}
        </div>
      </div>
      {right}
    </button>
  )
}
