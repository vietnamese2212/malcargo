// Form mã hàng — 4 ô bắt buộc (mã, tên, kích thước thùng), phần còn lại có mặc định.
import { useEffect, useState } from 'react'
import { Copy, Trash2, X } from 'lucide-react'
import type { Item } from '../data/types'
import { newId, useData } from '../data/store'
import { removeCatalog, saveCatalog, useAuth } from '../data/cloud'
import { t, tx } from '../i18n'
import { Badge, Button, Confirm, Field, NumInput, Sheet, Switch, TextInput, fmtDims, fmtInt } from './kit'

const blank = (owner: Item['owner'] = 'me'): Item => ({ id: newId(), owner, code: '', name: '', l: 0, w: 0, h: 0, kg: null, perPallet: null, maxLayers: null, light: false, updatedAt: 0 })

/** `asSample`: admin thêm một mã MẪU CHUNG mới. `onUnlink`: mở từ một dòng hàng của đơn — có nút "Bỏ khỏi đơn"
 *  thay cho nút xoá mã khỏi danh mục (ở màn chuyến, xoá hẳn mã là quá tay). */
export function ItemSheet({ item, open, onClose, onSaved, asSample, onUnlink }: {
  item: Item | null; open: boolean; onClose: () => void; onSaved?: (it: Item) => void; asSample?: boolean; onUnlink?: () => void
}) {
  const upsert = useData(s => s.upsertItem)
  const remove = useData(s => s.removeItem)
  const orders = useData(s => s.orders)
  const isAdmin = useAuth(s => s.isAdmin)
  const [f, setF] = useState<Item>(item ?? blank())
  const [tried, setTried] = useState(false)
  const [askDel, setAskDel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { if (open) { setF(item ?? blank(asSample ? 'admin' : 'me')); setTried(false); setErr(null) } }, [open, item, asSample])

  // Mẫu chung vẫn sửa được: bấm Lưu ⇒ thành mã CỦA TÔI (id mới), mẫu giữ nguyên. Admin thì lưu thẳng vào mẫu chung.
  const sample = f.owner === 'admin'
  const adminEdit = sample && isAdmin
  const saveShared = async () => {
    setTried(true)
    if (!valid) return
    setBusy(true)
    const e = await saveCatalog('item', { ...f, code: f.code.trim(), name: f.name.trim() })
    setBusy(false)
    if (e) setErr(t('Không lưu được mẫu chung: {e}', { e })); else onClose()
  }
  const delShared = async () => {
    const e = await removeCatalog('item', f.id)
    if (e) setErr(t('Không xoá được: {e}', { e })); else onClose()
  }
  const set = <K extends keyof Item>(k: K, v: Item[K]) => setF(x => ({ ...x, [k]: v }))
  const dimsOk = f.l > 0 && f.w > 0 && f.h > 0
  const errs = {
    code: !f.code.trim() ? t('Nhập mã hàng') : null,
    name: !f.name.trim() ? t('Nhập tên hàng') : null,
    // cùng khoảng với file Excel nhập Mã hàng (cạnh thùng 10–3.000 mm)
    dims: !dimsOk ? t('Nhập đủ dài, rộng, cao của thùng')
      : [f.l, f.w, f.h].some(v => v < 10 || v > 3000) ? t('Nhập số từ {min} đến {max}.', { min: fmtInt(10), max: fmtInt(3000) }) : null,
  }
  // Ai cũng có lúc gõ cm vào ô mm — cả 3 số dưới 100 thì hỏi lại
  const looksCm = dimsOk && f.l < 100 && f.w < 100 && f.h < 100
  const valid = !errs.code && !errs.name && !errs.dims
  const usedIn = orders.filter(o => o.lines.some(l => l.itemId === f.id)).length

  const save = () => {
    setTried(true)
    if (!valid) return
    const it: Item = { ...f, code: f.code.trim(), name: f.name.trim(), ...(sample ? { id: newId(), owner: 'me' as const, code: f.code.trim().replace(/^MAU-/, '') } : {}) }
    upsert(it); onSaved?.(it); onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}
      title={sample ? (item ? t('Mã mẫu: {name}', { name: tx(item.name) }) : t('Thêm mã mẫu chung')) : item ? t('Sửa mã hàng') : t('Thêm mã hàng')}
      subtitle={adminEdit ? <><Badge tone="blue">Admin</Badge> {t('Lưu mẫu chung: mọi người dùng thấy ngay.')}</>
        : sample ? t('Sửa rồi bấm Lưu, mã thành của bạn. Mẫu chung giữ nguyên.') : t('Kích thước tính bằng milimét (mm)')}
      footer={<>
        {err && <p className="mb-2 text-[13px] text-red-700">{err}</p>}
        <div className="flex gap-2">
          {item && !onUnlink && (!sample || adminEdit) && <Button variant="danger" onClick={() => setAskDel(true)} aria-label={sample ? t('Xoá mã mẫu') : t('Xoá mã')}><Trash2 size={17} /></Button>}
          {adminEdit ? <>
            {item && <Button className="flex-1" onClick={save}><Copy size={16} />{t('Lưu thành của tôi')}</Button>}
            <Button variant="primary" className="flex-1" disabled={busy} onClick={saveShared}>{busy ? t('Đang lưu…') : t('Lưu mẫu chung')}</Button>
          </> : <>
            <Button className="flex-1" onClick={onClose}>{t('Huỷ')}</Button>
            <Button variant="primary" className="flex-[2]" onClick={save}>{sample ? <><Copy size={17} />{t('Lưu thành mã của tôi')}</> : t('Lưu')}</Button>
          </>}
        </div>
      </>}>
      <fieldset className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <Field label={t('Mã')} error={tried ? errs.code : null}><TextInput value={f.code} onChange={e => set('code', e.target.value)} placeholder="SP001" autoFocus={!item} /></Field>
          <Field label={t('Tên hàng')} error={tried ? errs.name : null}><TextInput value={f.name} onChange={e => set('name', e.target.value)} placeholder={t('Sữa 110ml x48')} /></Field>
        </div>
        <Field label={t('Kích thước thùng (mm) — dài × rộng × cao')} error={tried ? errs.dims : null}
          hint={looksCm ? <span className="text-amber-800">{t('Số khá nhỏ — có phải bạn đang nhập cm? Ô này tính bằng mm (40 cm = 400 mm).')}</span> : t('Đo mặt ngoài thùng. Thùng đứng đúng chiều mũi tên thì "cao" là chiều đứng.')}>
          <div className="grid grid-cols-3 gap-2">
            <NumInput value={f.l || null} onChange={v => set('l', v ?? 0)} placeholder={t('Dài')} />
            <NumInput value={f.w || null} onChange={v => set('w', v ?? 0)} placeholder={t('Rộng')} />
            <NumInput value={f.h || null} onChange={v => set('h', v ?? 0)} placeholder={t('Cao')} />
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Khối lượng')} hint={t('Để trống nếu chưa biết')}><NumInput value={f.kg} onChange={v => set('kg', v)} suffix={t('kg/thùng')} placeholder="0" /></Field>
          <Field label={t('Chồng tối đa')} hint={t('Trống = theo chiều cao xe')}><NumInput value={f.maxLayers} onChange={v => set('maxLayers', v == null ? null : Math.max(1, Math.round(v)))} suffix={t('lớp')} placeholder={t('Tự động')} /></Field>
        </div>
        <Field label={t('Số thùng trên 1 pallet')} hint={t('Chỉ cần khi chở bằng xe pallet')}><NumInput value={f.perPallet} onChange={v => set('perPallet', v == null ? null : Math.round(v))} suffix={t('thùng')} placeholder="—" /></Field>
        <Switch checked={f.light} onChange={v => set('light', v)} label={t('Hàng nhẹ — cho lên trên hàng khác')} hint={t('Túi, hộp giấy nhẹ… được xếp lên mặt các khối hàng nặng')} />
        {sample && item && <p className="text-xs text-slate-600">{t('Mẫu gốc: thùng {dims} mm, số tham khảo, nên đo lại thùng thật.', { dims: fmtDims(item?.l ?? 0, item?.w ?? 0, item?.h ?? 0) })}</p>}
        {onUnlink && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <span className="text-[13px] text-slate-600">{sample ? t('Sửa số rồi Lưu: app tạo mã của bạn, thay vào đơn của chuyến này.') : t('Sửa ở đây là sửa cho mọi đơn dùng mã này.')}</span>
            <Button variant="danger" className="shrink-0" onClick={() => { onUnlink(); onClose() }}><X size={16} />{t('Bỏ khỏi đơn')}</Button>
          </div>
        )}
      </fieldset>
      <Confirm open={askDel} onClose={() => setAskDel(false)} title={sample ? t('Xoá mã mẫu {code}?', { code: f.code }) : t('Xoá mã {code}?', { code: f.code })}
        body={sample ? t('Mã mẫu biến mất khỏi danh sách của MỌI người dùng; đơn nào đang dùng sẽ báo thiếu mã.')
          : usedIn ? t('Mã này đang có trong {n} đơn — các dòng đó sẽ báo thiếu mã.', { n: fmtInt(usedIn) }) : t('Không thể hoàn tác.')}
        onOk={() => { if (sample) delShared(); else { remove(f.id); onClose() } }} />
    </Sheet>
  )
}
