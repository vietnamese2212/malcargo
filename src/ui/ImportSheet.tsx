// Nhập từ Excel: chọn loại (Mã hàng / Xe / Đơn hàng / Chuyến) → tải file mẫu CỦA LOẠI ĐÓ → điền → nạp file, hoặc chép
// bảng dán vào. Nạp được nhiều loại rồi nhập một lần (đơn dùng mã vừa nạp). Xem trước rồi mới nhập; còn một lỗi là KHÔNG
// nhập gì (báo từng lỗi kèm số dòng), tiêu đề cột sai mẫu ⇒ từ chối cả file.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import { famLabel, mySet, saveToMine, useAllItems, useAllVehicles, useData, useSpace } from '../data/store'
import { readFamily, saveCatalogMany, saveToFamily, useAuth, useFamily } from '../data/cloud'
import { SHEETS, parseImport, readWorkbook, sampleRows, saveTemplate, splitPasted, type Rows, type SheetKey } from '../data/importer'
import { t, tx } from '../i18n'
import { Button, Confirm, Sheet, Tabs, cx, fmtInt } from './kit'

// "Đã nhập 3 mã hàng, 2 xe" — mỗi trang một cụm đếm (tiếng Anh chia số ít / nhiều)
const COUNT: Record<SheetKey, string> = {
  items: '{n} mã hàng', vehicles: '{n} xe', orders: '{n} đơn hàng', trips: '{n} chuyến', // i18n-key
}

/** `trip`: mở từ Bàn xếp xe — đơn nhập vào mà chưa thuộc chuyến nào (trang Chuyến không ghi) thì thêm vào chuyến này. */
export function ImportSheet({ open, onClose, start = 'items', trip, onDone }: {
  open: boolean; onClose: () => void; start?: SheetKey; trip?: { id: string; name: string }; onDone?: (msg: string) => void
}) {
  const items = useAllItems()
  const vehicles = useAllVehicles()
  const orders = useData(s => s.orders)
  const trips = useData(s => s.trips)
  const importBatch = useData(s => s.importBatch)
  const sheets = SHEETS
  const first = start
  const admin = useAuth(s => s.isAdmin)
  const space = useSpace()
  // Family nhận dòng ghi "Family" khi bộ đó không mở: Family mình làm chủ, không thì Family duy nhất đang ở
  const fams = useFamily(s => s.families)
  const target = (() => { const f = fams.find(x => x.role === 'owner') ?? (fams.length === 1 ? fams[0] : null); return f && f.id !== space.id ? f : null })()
  const [famData, setFamData] = useState<Awaited<ReturnType<typeof readFamily>>>(null), [famBusy, setFamBusy] = useState(false), [famErr, setFamErr] = useState(false)
  useEffect(() => {
    if (!open || !target) { setFamData(null); setFamErr(false); return }
    let on = true
    setFamBusy(true); setFamErr(false)
    readFamily(target.id).then(d => { if (on) { setFamData(d); setFamErr(!d) } }).catch(() => { if (on) setFamErr(true) }).finally(() => { if (on) setFamBusy(false) })
    return () => { on = false }
  }, [open, target?.id])
  const [ask, setAsk] = useState(false), [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<SheetKey>(first)
  const [text, setText] = useState<Partial<Record<SheetKey, string>>>({})
  const [files, setFiles] = useState<Partial<Record<SheetKey, { name: string; rows: Rows }>>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) { setTab(first); setText({}); setFiles({}); setMsg(null) } }, [open, first])

  // ô dán có chữ thì dùng ô dán, không thì lấy file đã nạp cho loại đó
  const src = useMemo(() => Object.fromEntries(SHEETS.map(s => [s.key, !sheets.includes(s) ? [] : text[s.key]?.trim() ? splitPasted(text[s.key]!) : files[s.key]?.rows ?? []])), [text, files, sheets])
  const res = useMemo(() => parseImport(src, { items, vehicles, orders, trips }, { admin, space, mine: space.id === 'me' ? undefined : mySet(), family: target && famData ? { id: target.id, name: target.name, role: target.role, ...famData } : null }), [src, items, vehicles, orders, trips, admin, space, target?.id, target?.name, target?.role, famData])
  const n = {
    items: res.items.length + res.toMine.items.length + res.toFamily.items.length + res.toShared.items.length, vehicles: res.vehicles.length + res.toMine.vehicles.length + res.toFamily.vehicles.length + res.toShared.vehicles.length,
    orders: res.orders.length + res.toMine.orders.length + res.toFamily.orders.length, trips: res.trips.length + res.toMine.trips.length + res.toFamily.trips.length,
  }
  const total = n.items + n.vehicles + n.orders + n.trips, errs = res.errors.length
  // sẽ vào đâu — nhìn là biết trước khi bấm Nhập (chủ dự án 05/11)
  const size = (b: { items: unknown[]; vehicles: unknown[]; orders?: unknown[]; trips?: unknown[] }) => b.items.length + b.vehicles.length + (b.orders?.length ?? 0) + (b.trips?.length ?? 0)
  const nMine = size(res.toMine), nShared = size(res.toShared), nFam = size(res.toFamily)
  const nOpen = total - nMine - nShared - nFam
  const dests = [
    { label: space.id === 'me' ? t('Của tôi') : famLabel(space.name ?? ''), n: nOpen }, { label: t('Của tôi'), n: nMine }, { label: famLabel(target?.name ?? ''), n: nFam }, { label: t('Mẫu chung'), n: nShared },
  ].filter(d => d.n)
  const sharedList = [res.toShared.items.length && t(COUNT.items, { n: fmtInt(res.toShared.items.length) }), res.toShared.vehicles.length && t(COUNT.vehicles, { n: fmtInt(res.toShared.vehicles.length) })].filter(Boolean).join(', ')
  const def = SHEETS.find(s => s.key === tab)!
  const name = t(def.title), file = files[tab]

  // tiêu đề cột sai mẫu ⇒ từ chối CẢ file. File mang trang của loại khác (vd file mẫu Mã hàng nạp lúc đang ở Đơn hàng)
  // ⇒ vào đúng loại đó, chuyển sang xem
  const onFile = async (f?: File) => {
    if (!f) return
    try {
      const { rows: got, errors } = await readWorkbook(f, tab), keys = sheets.map(s => s.key).filter(k => got[k])
      if (errors.length) setMsg([t('Không nhận file {file} — tiêu đề cột không đúng mẫu:', { file: f.name }), ...errors].join('\n'))
      else {
        setFiles(x => ({ ...x, ...Object.fromEntries(keys.map(k => [k, { name: f.name, rows: got[k]! }])) }))
        if (keys.length && !keys.includes(tab)) setTab(keys[0])
        setMsg(null)
      }
    } catch { setMsg(t('Không đọc được file. Hãy dùng file mẫu .xlsx.')) }
    if (fileRef.current) fileRef.current.value = ''
  }
  // file mẫu kèm danh sách chọn lấy từ dữ liệu đang có (mã hàng, xe, đơn)
  const template = () => saveTemplate(tab, { items, vehicles, orders }).catch(() => setMsg(t('Không tạo được file mẫu.')))
  // mở từ Bàn xếp xe: đơn chưa thuộc chuyến nào vào chuyến này; chuyến dùng dòng xe của đơn ĐẦU có ghi (trống / sai ⇒ giữ như cũ)
  const save = async () => {
    setAsk(false)
    // Mẫu chung trước: máy chủ từ chối / mất mạng ⇒ báo, chưa ghi gì khác
    if (nShared || nFam) {
      setBusy(true)
      const e = nShared ? await saveCatalogMany('item', res.toShared.items) ?? await saveCatalogMany('vehicle', res.toShared.vehicles) : null
      if (e) { setBusy(false); setMsg(t('Không ghi được Mẫu chung: {e}', { e })); return }
      const f = nFam && target ? await saveToFamily(target.id, res.toFamily) : null
      setBusy(false)
      if (f) { setMsg(t('Không ghi được vào Family: {e}', { e: f })); return }
    }
    if (nMine) saveToMine(res.toMine)
    importBatch(res)
    if (trip) {
      const s = useData.getState(), cur = s.trips.find(x => x.id === trip.id)
      const loose = res.orders.map(o => o.id).filter(id => !s.trips.some(x => x.orderIds.includes(id)))
      const truck = res.orders.map(o => o.id).filter(id => loose.includes(id) || cur?.orderIds.includes(id)).map(id => res.orderTruck[id]).find(Boolean)
      if (cur && (loose.length || truck)) s.upsertTrip({ ...cur, orderIds: [...cur.orderIds, ...loose], ...(truck ? { vehicleId: truck } : {}) })
    }
    const parts = SHEETS.filter(s => n[s.key]).map(s => t(COUNT[s.key], { n: fmtInt(n[s.key]) }))
    onDone?.(t('Đã nhập {list}', { list: parts.join(', ') }))
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} wide title={t('Nhập từ Excel')}
      footer={<div className="flex gap-2">
        <Button className="flex-1" onClick={onClose}>{t('Huỷ')}</Button>
        {/* còn một lỗi là không nhập gì — sửa file rồi nạp lại */}
        <Button variant="primary" className="flex-[2]" disabled={!total || !!errs || busy || famBusy} onClick={() => (nShared ? setAsk(true) : void save())}>
          {errs ? t('Còn {n} lỗi, chưa nhập được', { n: fmtInt(errs) }) : total ? t('Nhập {n} dòng dữ liệu', { n: fmtInt(total) }) : t('Chưa có gì để nhập')}
        </Button>
      </div>}>
      {trip && <p className="mb-3 rounded-md bg-brand-50 px-3 py-2 text-[13px] text-brand-900">{t('Đơn nhập vào sẽ thêm vào {trip}.', { trip: tx(trip.name) })}</p>}
      {/* chọn loại trước: file mẫu, file nạp, ô dán bên dưới đều của loại này — cách điền nằm trong file mẫu, không giải thích thêm */}
      <Tabs value={tab} onChange={setTab}
        options={sheets.map(s => ({ value: s.key, label: <>{t(s.title)}{n[s.key] ? <span className="num ml-1 text-brand-700">· {n[s.key]}</span> : null}</> }))} />
      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={template}><Download size={17} />{t('Tải file mẫu')}</Button>
        <Button variant="primary" className="flex-1" onClick={() => fileRef.current?.click()}><Upload size={17} />{t('Nạp file')}</Button>
        <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
      </div>
      {file && (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-brand-50 px-3 py-1.5 text-sm">
          <FileSpreadsheet size={18} className="shrink-0 text-brand-700" /><span className="min-w-0 flex-1 break-all font-medium text-slate-900">{file.name}</span>
          <button onClick={() => setFiles(x => ({ ...x, [tab]: undefined }))} aria-label={t('Bỏ file')} className="grid h-8 w-8 shrink-0 place-items-center rounded text-slate-600 hover:bg-white"><X size={16} /></button>
        </div>
      )}
      <textarea value={text[tab] ?? ''} onChange={e => setText(x => ({ ...x, [tab]: e.target.value }))} rows={5} aria-label={t('Dán bảng {name}', { name })}
        placeholder={`${t('Hoặc dán bảng từ Excel')}\n${sampleRows(def).map(r => r.join('\t')).join('\n')}`}
        className="mt-3 w-full rounded-md border border-slate-300 p-2.5 font-mono text-base outline-none sm:text-[13px] placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />

      {msg && <p className="mt-3 whitespace-pre-line text-sm text-red-700">{msg}</p>}
      {famErr && <p className="mt-3 text-sm text-red-700">{t('Không đọc được dữ liệu Family — dòng ghi Family sẽ vào Của tôi. Thử lại khi có mạng.')}</p>}
      {total > 0 && (
        <div className={cx('mt-4 grid divide-x divide-slate-200 rounded-lg border border-slate-200', sheets.length === 4 ? 'grid-cols-4' : 'grid-cols-2')}>
          {sheets.map(s => (
            <div key={s.key} className="px-3 py-2">
              <div className={cx('num text-lg font-semibold', n[s.key] ? 'text-slate-900' : 'text-slate-400')}>{fmtInt(n[s.key])}</div>
              <div className="break-words text-[12px] leading-tight text-slate-600">{t(s.title)}</div>
            </div>
          ))}
        </div>
      )}
      {!errs && !!dests.length && <p data-dest className="mt-2 break-words text-[13px] font-medium text-slate-900">{t('Sẽ nhập vào: {list}', { list: dests.map(d => `${d.label} (${fmtInt(d.n)})`).join(' · ') })}</p>}
      {res.denied > 0 && <p className="mt-2 text-[13px] text-slate-700">{t('{n} dòng ghi Admin / Family nhưng tài khoản không có quyền ⇒ vào Của tôi.', { n: fmtInt(res.denied) })}</p>}
      {res.updated > 0 && <p className="mt-2 text-[13px] text-slate-700">{t('{n} dòng trùng với dữ liệu đã có sẽ được cập nhật.', { n: fmtInt(res.updated) })}</p>}
      {!!res.unknownTrucks.length && <p className="mt-2 break-words text-[13px] text-slate-700">{t('Dòng xe không có trong app, bỏ qua: {list}', { list: res.unknownTrucks.join(', ') })}</p>}
      {!!errs && (
        <ul data-errors className="mt-2 space-y-1 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {res.errors.slice(0, 20).map((e, i) => <li key={i} className="flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{e}</li>)}
          {errs > 20 && <li>{t('… và {n} lỗi khác', { n: fmtInt(errs - 20) })}</li>}
        </ul>
      )}
      <Confirm open={ask} onClose={() => setAsk(false)} danger={false} title={t('Ghi {list} vào Mẫu chung?', { list: sharedList })}
        body={<>
          {t('Mọi người dùng app đều thấy.')}
          {!!res.sharedDup.length && <p data-dup className="mt-2 break-words font-medium text-red-800">{t('Trùng {n} dòng đã có trong Mẫu chung, sẽ bị GHI ĐÈ: {list}', { n: fmtInt(res.sharedDup.length), list: res.sharedDup.slice(0, 12).join(', ') + (res.sharedDup.length > 12 ? '…' : '') })}</p>}
        </>} okText={t('Ghi vào Mẫu chung')} onOk={() => void save()} />
    </Sheet>
  )
}
