// Chọn mã hàng cho đơn: gõ tìm, bấm mã nào là thêm mã đó (bấm lại để bỏ), xong thì đóng.
import { useMemo, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { useAllItems } from '../data/store'
import type { Item } from '../data/types'
import { Button, SearchInput, Sheet } from './kit'
import { ItemRow } from '../pages/ItemsPage'
import { ItemSheet } from './ItemSheet'

export function ItemPicker({ open, onClose, picked, onToggle }: {
  open: boolean; onClose: () => void; picked: Set<string>; onToggle: (it: Item) => void
}) {
  const all = useAllItems()
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return all.filter(i => !t || i.code.toLowerCase().includes(t) || i.name.toLowerCase().includes(t))
  }, [all, q])
  const mine = list.filter(i => i.owner === 'me'), admin = list.filter(i => i.owner === 'admin')
  const row = (i: Item) => (
    <ItemRow key={i.id} item={i} onClick={() => onToggle(i)}
      right={<span className={`grid h-5 w-5 shrink-0 place-items-center rounded border-2 transition-colors ${picked.has(i.id) ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-400'}`}>
        {picked.has(i.id) && <Check size={13} strokeWidth={3} />}
      </span>} />
  )
  return (
    <>
      <Sheet open={open && !creating} onClose={onClose} title="Chọn mã hàng" subtitle="Bấm để thêm vào đơn — bấm lại để bỏ"
        footer={<div className="flex gap-2">
          <Button className="flex-1" onClick={() => setCreating(true)}><Plus size={17} />Mã mới</Button>
          <Button variant="primary" className="flex-[2]" onClick={onClose}>Xong{picked.size ? ` · ${picked.size} mã` : ''}</Button>
        </div>}>
        <SearchInput placeholder="Tìm mã hoặc tên" value={q} onChange={e => setQ(e.target.value)} aria-label="Tìm mã hàng" />
        {!!mine.length && <>
          <h3 className="mb-1.5 mt-4 text-[13px] font-semibold text-slate-700">Của tôi</h3>
          <div className="card divide-y divide-slate-100 overflow-hidden">{mine.map(row)}</div>
        </>}
        {!!admin.length && <>
          <h3 className="mb-1.5 mt-4 text-[13px] font-semibold text-slate-700">Mẫu chung</h3>
          <div className="card divide-y divide-slate-100 overflow-hidden">{admin.map(row)}</div>
        </>}
        {!list.length && <p className="py-8 text-center text-sm text-slate-600">Không có mã nào khớp — bấm “Mã mới” để thêm.</p>}
      </Sheet>
      <ItemSheet open={creating} item={null} onClose={() => setCreating(false)} onSaved={it => { if (!picked.has(it.id)) onToggle(it) }} />
    </>
  )
}
