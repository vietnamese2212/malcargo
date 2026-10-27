// Nhập từ Excel: tải file mẫu 4 trang → điền → nạp cả file, hoặc chép từng bảng dán vào. Xem trước rồi mới nhập.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import { useAllItems, useAllVehicles, useData } from '../data/store'
import { SHEETS, downloadTemplate, parseImport, readWorkbook, splitPasted, type Rows, type SheetKey } from '../data/importer'
import { Button, Sheet, Tabs, cx, fmtInt } from './kit'

export function ImportSheet({ open, onClose, start = 'items', onDone }: { open: boolean; onClose: () => void; start?: SheetKey; onDone?: (msg: string) => void }) {
  const items = useAllItems()
  const vehicles = useAllVehicles()
  const orders = useData(s => s.orders)
  const trips = useData(s => s.trips)
  const importBatch = useData(s => s.importBatch)
  const [tab, setTab] = useState<SheetKey>(start)
  const [text, setText] = useState<Partial<Record<SheetKey, string>>>({})
  const [file, setFile] = useState<{ name: string; rows: Partial<Record<SheetKey, Rows>> } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) { setTab(start); setText({}); setFile(null); setMsg(null) } }, [open, start])

  // ô dán có chữ thì dùng ô dán, không thì lấy trang tương ứng trong file đã nạp
  const src = useMemo(() => Object.fromEntries(SHEETS.map(s => [s.key, text[s.key]?.trim() ? splitPasted(text[s.key]!) : file?.rows[s.key] ?? []])), [text, file])
  const res = useMemo(() => parseImport(src, { items, vehicles, orders, trips }), [src, items, vehicles, orders, trips])
  const n = { items: res.items.length, vehicles: res.vehicles.length, orders: res.orders.length, trips: res.trips.length }
  const total = n.items + n.vehicles + n.orders + n.trips
  const def = SHEETS.find(s => s.key === tab)!

  const onFile = async (f?: File) => {
    if (!f) return
    try { setFile({ name: f.name, rows: await readWorkbook(f) }); setMsg(null) }
    catch { setMsg('Không đọc được file. Hãy dùng file .xlsx tải từ nút "Tải file mẫu".') }
    if (fileRef.current) fileRef.current.value = ''
  }
  const save = () => {
    importBatch(res)
    const parts = SHEETS.filter(s => n[s.key]).map(s => `${fmtInt(n[s.key])} ${s.title.toLowerCase()}`)
    onDone?.(`Đã nhập ${parts.join(', ')}`)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} wide title="Nhập từ Excel" subtitle="Mã hàng · Xe · Đơn hàng · Chuyến, trong một file mẫu"
      footer={<div className="flex gap-2">
        <Button className="flex-1" onClick={onClose}>Huỷ</Button>
        <Button variant="primary" className="flex-[2]" disabled={!total} onClick={save}>{total ? `Nhập ${fmtInt(total)} dòng dữ liệu` : 'Chưa có gì để nhập'}</Button>
      </div>}>
      <ol className="space-y-3">
        <li className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-start gap-3">
            <Step n={1} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900">Tải file mẫu</div>
              <p className="text-[13px] text-slate-600">4 trang Mã hàng, Xe, Đơn hàng, Chuyến. Mỗi trang có tiêu đề cột (dấu * là bắt buộc) và dòng ví dụ.</p>
            </div>
          </div>
          <Button className="mt-2.5 w-full" onClick={() => downloadTemplate().catch(() => setMsg('Không tạo được file mẫu.'))}><Download size={17} />Tải file mẫu .xlsx</Button>
        </li>
        <li className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-start gap-3">
            <Step n={2} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900">Điền xong thì nạp cả file</div>
              <p className="text-[13px] text-slate-600">App đọc đủ 4 trang một lần. Trang nào để trống thì bỏ qua.</p>
            </div>
          </div>
          {file ? (
            <div className="mt-2.5 flex items-center gap-2 rounded-md bg-brand-50 px-3 py-2 text-sm">
              <FileSpreadsheet size={18} className="shrink-0 text-brand-700" /><span className="min-w-0 flex-1 truncate font-medium text-slate-900">{file.name}</span>
              <button onClick={() => setFile(null)} aria-label="Bỏ file" className="grid h-8 w-8 place-items-center rounded text-slate-600 hover:bg-white"><X size={16} /></button>
            </div>
          ) : (
            <Button variant="primary" className="mt-2.5 w-full" onClick={() => fileRef.current?.click()}><Upload size={17} />Nạp file .xlsx</Button>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
        </li>
      </ol>

      <div className="mt-4 rounded-lg border border-slate-200">
        <div className="border-b border-slate-200 px-3 pt-2.5">
          <p className="text-[13px] text-slate-700">Hoặc chép từng bảng trong Excel rồi dán vào đây:</p>
          <Tabs value={tab} onChange={setTab} flush className="mt-1"
            options={SHEETS.map(s => ({ value: s.key, label: <>{s.title}{n[s.key] ? <span className="num ml-1 text-brand-700">· {n[s.key]}</span> : null}</> }))} />
        </div>
        <div className="p-3">
          <div className="flex flex-wrap gap-1">
            {def.cols.map((c, i) => (
              <span key={c.label} className={cx('num rounded border px-1.5 py-0.5 text-[12px]', c.req ? 'border-brand-200 bg-brand-50 font-semibold text-brand-800' : 'border-slate-200 bg-slate-50 text-slate-700')}>
                {String.fromCharCode(65 + i)} · {c.label}{c.req && ' *'}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-slate-600">{def.note}</p>
          <textarea value={text[tab] ?? ''} onChange={e => setText(t => ({ ...t, [tab]: e.target.value }))} rows={6} aria-label={`Dán bảng ${def.title}`}
            placeholder={def.sample.map(r => r.join('\t')).join('\n')}
            className="mt-2 w-full rounded-md border border-slate-300 p-2.5 font-mono text-[13px] outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        </div>
      </div>

      {msg && <p className="mt-3 text-sm text-red-700">{msg}</p>}
      {total > 0 && (
        <div className="mt-4 grid grid-cols-4 divide-x divide-slate-200 rounded-lg border border-slate-200">
          {SHEETS.map(s => (
            <div key={s.key} className="px-3 py-2">
              <div className={cx('num text-lg font-semibold', n[s.key] ? 'text-slate-900' : 'text-slate-400')}>{fmtInt(n[s.key])}</div>
              <div className="break-words text-[12px] leading-tight text-slate-600">{s.title}</div>
            </div>
          ))}
        </div>
      )}
      {res.updated > 0 && <p className="mt-2 text-[13px] text-slate-700">{fmtInt(res.updated)} dòng trùng với dữ liệu đã có sẽ được cập nhật.</p>}
      {!!res.errors.length && (
        <ul className="mt-2 space-y-1 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {res.errors.slice(0, 8).map(e => <li key={e} className="flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{e}</li>)}
          {res.errors.length > 8 && <li>… và {res.errors.length - 8} dòng khác</li>}
        </ul>
      )}
    </Sheet>
  )
}

const Step = ({ n }: { n: number }) => <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-navy-950 text-[12px] font-semibold text-white">{n}</span>
