import { useEffect, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import type { Vehicle } from '../data/types'
import { newId, useData } from '../data/store'
import { removeCatalog, saveCatalog, useAuth } from '../data/cloud'
import { palletFloorSlots } from '../engine/loadPlan'
import Scene from '../three/LazyScene'
import { Badge, Button, Confirm, Field, NumInput, Segmented, Sheet, TextInput, fmtDec } from './kit'

const blank = (owner: Vehicle['owner'] = 'me'): Vehicle => ({ id: newId(), owner, name: '', plate: '', kind: 'loose', l: 0, w: 0, h: 0, payloadKg: null, updatedAt: 0 })

/** `asSample`: admin thêm một xe MẪU CHUNG mới. */
export function VehicleSheet({ vehicle, open, onClose, onSaved, asSample }: {
  vehicle: Vehicle | null; open: boolean; onClose: () => void; onSaved?: (v: Vehicle) => void; asSample?: boolean
}) {
  const upsert = useData(s => s.upsertVehicle)
  const remove = useData(s => s.removeVehicle)
  const pallet = useData(s => s.pallet)
  const isAdmin = useAuth(s => s.isAdmin)
  const [f, setF] = useState<Vehicle>(vehicle ?? blank())
  const [tried, setTried] = useState(false)
  const [askDel, setAskDel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { if (open) { setF(vehicle ?? blank(asSample ? 'admin' : 'me')); setTried(false); setErr(null) } }, [open, vehicle, asSample])

  // Mẫu chung vẫn sửa được: bấm Lưu ⇒ thành xe CỦA TÔI (id mới), mẫu giữ nguyên. Admin thì lưu thẳng vào mẫu chung.
  const sample = f.owner === 'admin'
  const adminEdit = sample && isAdmin
  const saveShared = async () => {
    setTried(true)
    if (!valid) return
    setBusy(true)
    const e = await saveCatalog('vehicle', { ...f, name: f.name.trim() || f.plate.trim().toUpperCase(), plate: f.plate.trim().toUpperCase() })
    setBusy(false)
    if (e) setErr(`Không lưu được mẫu chung: ${e}`); else onClose()
  }
  const delShared = async () => {
    const e = await removeCatalog('vehicle', f.id)
    if (e) setErr(`Không xoá được: ${e}`); else onClose()
  }
  const set = <K extends keyof Vehicle>(k: K, v: Vehicle[K]) => setF(x => ({ ...x, [k]: v }))
  const dimsOk = f.l >= 500 && f.w >= 500 && f.h >= 500 && f.l <= 20000 && f.w <= 3500 && f.h <= 4500
  const errs = {
    name: !f.name.trim() && !f.plate.trim() ? 'Đặt tên hoặc nhập biển số' : null,
    dims: !dimsOk ? 'Lòng thùng: dài 0,5–20 m, rộng ≤ 3,5 m, cao ≤ 4,5 m (nhập mm)' : null,
  }
  const valid = !errs.name && !errs.dims
  const m3 = dimsOk ? (f.l * f.w * f.h) / 1e9 : 0
  const slots = dimsOk && f.kind === 'pallet' ? palletFloorSlots({ l: pallet.l, w: pallet.w, h: pallet.maxH, baseH: pallet.baseH, baseColor: '' }, { length: f.l, width: f.w, height: f.h }) : 0

  const save = () => {
    setTried(true)
    if (!valid) return
    let name = f.name.trim() || f.plate.trim().toUpperCase()
    if (sample && name === vehicle?.name) name = `${name} (của tôi)`
    const v: Vehicle = { ...f, name, plate: f.plate.trim().toUpperCase(), ...(sample ? { id: newId(), owner: 'me' as const } : {}) }
    upsert(v); onSaved?.(v); onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} wide
      title={sample ? (vehicle ? `Xe mẫu: ${vehicle.name}` : 'Thêm xe mẫu chung') : vehicle ? 'Sửa xe' : 'Thêm xe'}
      subtitle={adminEdit ? <><Badge tone="blue">Admin</Badge> Lưu mẫu chung: mọi người dùng thấy ngay.</>
        : sample ? 'Sửa rồi bấm Lưu, xe thành của bạn. Mẫu chung giữ nguyên.' : 'Đo LÒNG thùng (bên trong), tính bằng mm'}
      footer={<>
        {err && <p className="mb-2 text-[13px] text-red-700">{err}</p>}
        <div className="flex gap-2">
          {vehicle && (!sample || adminEdit) && <Button variant="danger" onClick={() => setAskDel(true)} aria-label={sample ? 'Xoá xe mẫu' : 'Xoá xe'}><Trash2 size={17} /></Button>}
          {adminEdit ? <>
            {vehicle && <Button className="flex-1" onClick={save}><Copy size={16} />Lưu thành của tôi</Button>}
            <Button variant="primary" className="flex-1" disabled={busy} onClick={saveShared}>{busy ? 'Đang lưu…' : 'Lưu mẫu chung'}</Button>
          </> : <>
            <Button className="flex-1" onClick={onClose}>Huỷ</Button>
            <Button variant="primary" className="flex-[2]" onClick={save}>{sample ? <><Copy size={17} />Lưu thành xe của tôi</> : 'Lưu'}</Button>
          </>}
        </div>
      </>}>
      <div className="-mx-5 -mt-4 mb-4">
        {dimsOk
          ? <Scene className="h-[200px] sm:h-[240px]" truck={{ l: f.l, w: f.w, h: f.h, kind: f.kind }} walls="glass" />
          : <div className="grid h-[120px] place-items-center bg-[#e7ecf2] text-sm text-slate-600">Nhập lòng thùng để xem trước xe</div>}
        {dimsOk && (
          <div className="flex justify-center gap-4 border-b border-slate-200 bg-white py-2 text-[13px] text-slate-600">
            <span><b className="num text-slate-800">{fmtDec(m3, 1)}</b> m³</span>
            {f.kind === 'pallet' && <span><b className="num text-slate-800">{slots}</b> chỗ pallet trên sàn</span>}
          </div>
        )}
      </div>
      <fieldset className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tên xe" error={tried ? errs.name : null}><TextInput value={f.name} onChange={e => set('name', e.target.value)} placeholder="Xe 5 tấn số 1" /></Field>
          <Field label="Biển số"><TextInput value={f.plate} onChange={e => set('plate', e.target.value)} placeholder="29C12345" /></Field>
        </div>
        <Field label="Cách chở" group>
          <Segmented value={f.kind} onChange={v => set('kind', v)} options={[
            { value: 'loose', label: 'Thùng rời (xe xá)' }, { value: 'pallet', label: 'Xếp pallet' },
          ]} />
        </Field>
        <Field label="Lòng thùng (mm) — dài × rộng × cao" error={tried ? errs.dims : null}>
          <div className="grid grid-cols-3 gap-2">
            <NumInput value={f.l || null} onChange={v => set('l', v ?? 0)} placeholder="Dài" />
            <NumInput value={f.w || null} onChange={v => set('w', v ?? 0)} placeholder="Rộng" />
            <NumInput value={f.h || null} onChange={v => set('h', v ?? 0)} placeholder="Cao" />
          </div>
        </Field>
        <Field label="Tải trọng cho phép" hint="Để trống thì không kiểm vượt tải">
          <NumInput value={f.payloadKg} onChange={v => set('payloadKg', v)} suffix="kg" placeholder="5000" />
        </Field>
      </fieldset>
      <Confirm open={askDel} onClose={() => setAskDel(false)} title={`Xoá ${sample ? 'xe mẫu ' : ''}${f.name || f.plate}?`}
        body={sample ? 'Xe mẫu biến mất khỏi danh sách của MỌI người dùng. Chuyến đang dùng xe này phải chọn xe khác.' : 'Chuyến đang dùng xe này sẽ phải chọn xe khác.'}
        onOk={() => { if (sample) delShared(); else { remove(f.id); onClose() } }} />
    </Sheet>
  )
}
