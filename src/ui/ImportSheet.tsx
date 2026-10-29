// Nhập từ Excel: chọn loại (Mã hàng / Xe / Đơn hàng / Chuyến) → tải file mẫu CỦA LOẠI ĐÓ → điền → nạp file, hoặc chép
// bảng dán vào. Nạp được nhiều loại rồi nhập một lần (đơn dùng mã vừa nạp). Xem trước rồi mới nhập; còn một lỗi là KHÔNG
// nhập gì (báo từng lỗi kèm số dòng), tiêu đề cột sai mẫu ⇒ từ chối cả file.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import { useAllItems, useAllVehicles, useData } from '../data/store'
import { SHEETS, parseImport, readWorkbook, sampleRows, saveTemplate, splitPasted, type Rows, type SheetKey } from '../data/importer'
import { t, tx } from '../i18n'
import { Button, Sheet, Tabs, cx, fmtInt } from './kit'

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
  const [tab, setTab] = useState<SheetKey>(start)
  const [text, setText] = useState<Partial<Record<SheetKey, string>>>({})
  const [files, setFiles] = useState<Partial<Record<SheetKey, { name: string; rows: Rows }>>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) { setTab(start); setText({}); setFiles({}); setMsg(null) } }, [open, start])

  // ô dán có chữ thì dùng ô dán, không thì lấy file đã nạp cho loại đó
  const src = useMemo(() => Object.fromEntries(SHEETS.map(s => [s.key, text[s.key]?.trim() ? splitPasted(text[s.key]!) : files[s.key]?.rows ?? []])), [text, files])
  const res = useMemo(() => parseImport(src, { items, vehicles, orders, trips }), [src, items, vehicles, orders, trips])
  const n = { items: res.items.length, vehicles: res.vehicles.length, orders: res.orders.length, trips: res.trips.length }
  const total = n.items + n.vehicles + n.orders + n.trips, errs = res.errors.length
  const def = SHEETS.find(s => s.key === tab)!
  const name = t(def.title), file = files[tab]

  // tiêu đề cột sai mẫu ⇒ từ chối CẢ file. File mang trang của loại khác (vd file mẫu Mã hàng nạp lúc đang ở Đơn hàng)
  // ⇒ vào đúng loại đó, chuyển sang xem
  const onFile = async (f?: File) => {
    if (!f) return
    try {
      const { rows: got, errors } = await readWorkbook(f, tab), keys = SHEETS.map(s => s.key).filter(k => got[k])
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
  const save = () => {
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
        <Button variant="primary" className="flex-[2]" disabled={!total || !!errs} onClick={save}>
          {errs ? t('Còn {n} lỗi, chưa nhập được', { n: fmtInt(errs) }) : total ? t('Nhập {n} dòng dữ liệu', { n: fmtInt(total) }) : t('Chưa có gì để nhập')}
        </Button>
      </div>}>
      {trip && <p className="mb-3 rounded-md bg-brand-50 px-3 py-2 text-[13px] text-brand-900">{t('Đơn nhập vào sẽ thêm vào {trip}.', { trip: tx(trip.name) })}</p>}
      {/* chọn loại trước: file mẫu, file nạp, ô dán bên dưới đều của loại này — cách điền nằm trong file mẫu, không giải thích thêm */}
      <Tabs value={tab} onChange={setTab}
        options={SHEETS.map(s => ({ value: s.key, label: <>{t(s.title)}{n[s.key] ? <span className="num ml-1 text-brand-700">· {n[s.key]}</span> : null}</> }))} />
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
      {total > 0 && (
        <div className="mt-4 grid grid-cols-4 divide-x divide-slate-200 rounded-lg border border-slate-200">
          {SHEETS.map(s => (
            <div key={s.key} className="px-3 py-2">
              <div className={cx('num text-lg font-semibold', n[s.key] ? 'text-slate-900' : 'text-slate-400')}>{fmtInt(n[s.key])}</div>
              <div className="break-words text-[12px] leading-tight text-slate-600">{t(s.title)}</div>
            </div>
          ))}
        </div>
      )}
      {res.updated > 0 && <p className="mt-2 text-[13px] text-slate-700">{t('{n} dòng trùng với dữ liệu đã có sẽ được cập nhật.', { n: fmtInt(res.updated) })}</p>}
      {!!res.unknownTrucks.length && <p className="mt-2 break-words text-[13px] text-slate-700">{t('Dòng xe không có trong app, bỏ qua: {list}', { list: res.unknownTrucks.join(', ') })}</p>}
      {!!errs && (
        <ul data-errors className="mt-2 space-y-1 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {res.errors.slice(0, 20).map((e, i) => <li key={i} className="flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{e}</li>)}
          {errs > 20 && <li>{t('… và {n} lỗi khác', { n: fmtInt(errs - 20) })}</li>}
        </ul>
      )}
    </Sheet>
  )
}
