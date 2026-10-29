// BÀN XẾP XE — màn làm việc duy nhất. Khung 3D đọc như một BẢN VẼ KỸ THUẬT: dải thông số xe ở đầu
// (một chạm đổi xá/pallet, chạm để chỉnh thùng xe), khung tên gọn ở góc trên trái (chạm để xem chi tiết).
// Cột trái: hàng trên xe theo từng đơn + bảng đếm chân. Thanh trên: chọn / xoá chuyến cạnh nút "+".
// Sửa mã hàng / xe MẪU CHUNG ⇒ tự thành bản "của tôi" rồi gắn vào chuyến, mẫu giữ nguyên.
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle, ArrowDown, ArrowUp, Camera, Check, ChevronDown, ClipboardCopy, ClipboardList, CloudOff, Crosshair, ExternalLink, Eye, EyeOff,
  FileSpreadsheet, Layers, Loader2, LogOut, MapPin, Maximize2, Menu, Minimize2, Minus, MoreVertical, Package, Pause, Pencil, Play, Plus, Rotate3d, Ruler,
  Settings, SlidersHorizontal, Sparkles, Table2, Trash2, Truck, Upload, UserRound, Users, X,
} from 'lucide-react'
import { findVehicle, isBlankOrder, isSample, newId, newTripLabel, nextName, useAllItems, useAllVehicles, useData } from '../data/store'
import { signInGoogle, signOut, useAuth } from '../data/cloud'
import { pickPool, resolveOrder, truckOf } from '../data/resolve'
import { orderTotals, type TripInput, type TripResult } from '../engine/plan'
import { useTripPlan } from '../engine/useTripPlan'
import type { FitCheck } from '../engine/worker'
import type { Item, Order, Trip, Vehicle, VehicleKind } from '../data/types'
import Scene from '../three/LazyScene'
import type { ViewPreset } from '../three/TruckScene'
import { groupColor, itemColors, tint } from '../three/colors'
import {
  Badge, BoxGlyph, Button, Confirm, Empty, Field, IconButton, KeyboardShield, LiveNum, MenuItem, Popover, SearchInput, SectionBand, Segmented, Sheet,
  TextInput, cx, fmtDec, fmtDims, fmtInt, fmtKgShort, fmtM3, usePhone, useViewportBox, useVisualView,
} from '../ui/kit'
import { Logo, PageHeader, Panel } from '../ui/Shell'
import { TruckGlyph } from './VehiclesPage'
import { VehicleSheet } from '../ui/VehicleSheet'
import { ItemSheet } from '../ui/ItemSheet'
import { ExplainPopup } from './TripExplain'
import { PalletFields, PalletSheet } from '../ui/PalletSettings'
import { LangSwitch } from '../ui/LangSwitch'
import { t, tx } from '../i18n'
import { ItemPicker } from '../ui/ItemPicker'
import { ImportSheet } from '../ui/ImportSheet'
import { saveFile } from '../ui/saveFile'
import { go, replaceRoute } from '../ui/route'
import ItemsPage from './ItemsPage'
import VehiclesPage from './VehiclesPage'
import OrdersPage from './OrdersPage'
import TripsPage from './TripsPage'
import AccountPage from './AccountPage'

const VIEWS = [['overview', 'Tổng thể'], ['rear', 'Nhìn từ cửa sau'], ['side', 'Nhìn bên hông'], ['top', 'Nhìn từ trên']] as const // i18n-key
type PanelName = 'items' | 'vehicles' | 'orders' | 'trips' | 'account'
const MENU: { p: PanelName; label: string; icon: typeof Package }[] = [
  { p: 'items', label: 'Mã hàng', icon: Package }, { p: 'vehicles', label: 'Xe', icon: Truck }, { p: 'orders', label: 'Đơn hàng', icon: ClipboardList }, // i18n-key
]
// Lòng thùng hợp lệ (mm) — khớp form Thêm xe
const OK_L = (n: number) => n >= 500 && n <= 20000, OK_W = (n: number) => n >= 500 && n <= 3500, OK_H = (n: number) => n >= 500 && n <= 4500
const m = (mm: number) => fmtDec(mm / 1000, 1)

export default function TripPage({ id }: { id: string }) {
  // vừa tách chuyến mẫu: đọc NGAY chuyến mới — đường dẫn đổi sau một nhịp; phím gõ nhanh rơi vào nhịp đó mà còn thấy
  // chuyến mẫu thì sửa lại chuyến mẫu ⇒ tách lần hai, số lẫn (ui-flow bắt được 29/10: gõ 200 lưu thành 150200)
  const tid = useData(s => (s.fork && !s.fork.seen && s.fork.from === id ? s.fork.to : id))
  const trip = useData(s => s.trips.find(t => t.id === tid))
  const trips = useData(s => s.trips)
  const orders = useData(s => s.orders)
  const pallet = useData(s => s.pallet)
  const upsertTrip = useData(s => s.upsertTrip)
  const removeTrip = useData(s => s.removeTrip)
  const upsertVehicle = useData(s => s.upsertVehicle)
  const upsertOrder = useData(s => s.upsertOrder)
  const removeOrder = useData(s => s.removeOrder)
  const items = useAllItems()
  const vehicles = useAllVehicles()
  // bảng Thùng xe: null = đóng; more = phần thông số đang mở (bấm chip Lòng / Tải / nút chỉnh ⇒ mở sẵn, bấm tên xe ⇒ gấp — để đổi xe)
  const [spec, setSpec] = useState<{ more: boolean } | null>(null)

  const vehicle = findVehicle(vehicles, trip?.vehicleId ?? null)
  const candidates = useMemo(() => pickPool(vehicles, vehicle).map(truckOf), [vehicles, vehicle])
  const allTrucks = useMemo(() => vehicles.map(truckOf), [vehicles])
  const rawOrders = useMemo(() => (trip?.orderIds ?? []).map(oid => orders.find(o => o.id === oid)).filter((o): o is Order => !!o), [trip?.orderIds, orders])
  const tripOrders = useMemo(() => rawOrders.map(o => resolveOrder(o, items)), [rawOrders, items])
  // Chưa chọn xe: tạm tính trên xe lớn nhất cùng kiểu để lấy gợi ý, rồi tự gán xe gợi ý
  const fallback = useMemo(() => [...candidates].sort((a, b) => b.l * b.w * b.h - a.l * a.w * a.h)[0], [candidates])
  const truck = vehicle ? truckOf(vehicle) : fallback
  const hasCargo = tripOrders.some(o => o.lines.some(l => l.qty > 0))
  const input: TripInput | null = trip && truck && hasCargo ? { truck, orders: tripOrders, pallet, lightOwnPallet: trip.lightOwnPallet } : null
  // bảng đổi xe đang mở ⇒ thử hàng trên MỌI xe để đánh dấu ✓ / ✗ trong danh sách
  const { result, suggestion, fits, busy, error } = useTripPlan(input, candidates, spec ? allTrucks : undefined)

  useEffect(() => {
    if (!trip || trip.vehicleId || !result || !hasCargo) return
    const pick = suggestion ?? fallback?.id
    if (pick) { upsertTrip({ ...trip, vehicleId: pick }); setToast(suggestion ? t('Đã chọn xe nhỏ nhất chở hết hàng') : t('Không xe nào chở hết, tạm chọn xe lớn nhất')) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, suggestion])

  const [step, setStep] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [focus, setFocus] = useState<Set<number> | null>(null)   // soi từ bảng đếm chân (chỉ số khối)
  const [sel, setSel] = useState<{ orderId: string; itemId?: string } | null>(null)   // chọn đơn / mã ở cột trái
  const [view, setView] = useState<{ preset: ViewPreset; n: number }>({ preset: 'overview', n: 0 })
  const [walls, setWalls] = useState<'open' | 'glass'>('open')
  const [open, setOpen] = useState({ cargo: true, count: false })
  const [explain, setExplain] = useState(false)   // popup bảng diễn giải từng mã (nút trên khung 3D)
  const [palletOpen, setPalletOpen] = useState(false)   // cài đặt pallet (nút ⚙ cạnh nút chọn Pallet)
  const [panel, setPanel] = useState<PanelName | null>(null)
  const [importing, setImporting] = useState<'menu' | 'trip' | null>(null)   // 'trip' = nút nhập đơn trên bàn ⇒ đơn vào chuyến này
  const phone = usePhone()   // điện thoại không có phần nhập Excel
  const [unlink, setUnlink] = useState<Order | null>(null)
  const [editVehicle, setEditVehicle] = useState<{ v: Vehicle | null } | null>(null)
  const [pickOrders, setPickOrders] = useState(false)
  const [pickFor, setPickFor] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editOrder, setEditOrder] = useState<string | null>(null)
  const [delTrip, setDelTrip] = useState<Trip | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3200); return () => clearTimeout(t) }, [toast])
  // điện thoại gõ số thùng: bàn phím chiếm nửa dưới, khung 3D dính nửa trên ⇒ ô đang gõ bị kẹt giữa, khuất.
  // Bàn phím mở thì khung 3D thôi dính, trôi theo trang — ô đang gõ luôn thấy được.
  const { kb } = useVisualView()
  const [full, setFull] = useToggleFull()

  // Sửa chuyến mẫu ⇒ kho đã tách thành chuyến mới: chuyển sang chuyến đó tại chỗ (màn giữ nguyên, ô đang mở
  // trỏ sang đơn bản sao), rồi báo mã chuyến mới. Chuyến mẫu không đổi.
  const fork = useData(s => s.fork)
  const markForkSeen = useData(s => s.markForkSeen)
  useEffect(() => {
    if (!fork || fork.seen) return
    if (fork.from === id) {
      const map = fork.orders
      setPickFor(p => (p && map[p]) || p)
      setEditing(e => { if (!e) return e; const i = e.indexOf(':'); return map[e.slice(0, i)] ? map[e.slice(0, i)] + e.slice(i) : e })
      setSel(s => (s && map[s.orderId] ? { ...s, orderId: map[s.orderId] } : s))
      replaceRoute({ page: 'trip', id: fork.to })
    } else if (fork.to === id) {
      markForkSeen()
      setToast(t('Đã lưu thành chuyến mới {code}, chuyến mẫu giữ nguyên', { code: useData.getState().trips.find(x => x.id === id)?.code ?? '' }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fork, id])
  // khối đơn / dòng hàng giữ KEY của đơn mẫu gốc sau khi tách: id đơn đổi mà React không dựng lại ô số thùng
  // ⇒ đang gõ "150" → "200" không bị mất con trỏ sau phím đầu (phím đầu là lúc tách)
  const keyOf = useMemo(() => {
    const m = new Map<string, string>()
    if (fork && fork.to === tid) for (const [from, to] of Object.entries(fork.orders)) m.set(to, from)
    return (oid: string) => m.get(oid) ?? oid
  }, [fork, tid])

  const plan = vehicle && hasCargo ? result?.plan ?? null : null
  const stepCount = plan?.stepCount ?? 0
  useEffect(() => { setStep(null); setPlaying(false); setFocus(null) }, [plan])
  useEffect(() => {
    if (!playing || !stepCount) return
    const iv = Math.max(60, Math.min(420, 12000 / stepCount))
    const t = setInterval(() => setStep(s => {
      const n = (s ?? 0) + 1
      if (n >= stepCount) { setPlaying(false); return null }
      return n
    }), iv)
    return () => clearInterval(t)
  }, [playing, stepCount])

  // Màu theo MÃ, cố định — đổi xe / cách chở / số lượng không làm đổi màu hàng đã có
  const colors = useMemo(() => itemColors(tripOrders.flatMap(o => o.lines.map(l => l.item))), [tripOrders])
  // chữ in trên thùng 3D: tên (mã mẫu theo ngôn ngữ) + mã + cỡ thùng gốc — để thùng xoay vẫn in đúng mặt.
  // Chỉ đổi khi chính các mã đổi (gõ số thùng không dựng lại hàng hai lần: lúc gõ và lúc sơ đồ tính xong)
  const printList = tripOrders.flatMap(o => o.lines.map(l => l.item))
  const printKey = printList.map(i => `${i.id}|${i.code}|${i.name}|${i.l}|${i.w}|${i.h}`).join(';')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prints = useMemo(() => new Map(printList.map(i => [i.id, { code: i.code, name: tx(i.name), l: i.l, w: i.w, h: i.h }] as const)), [printKey])
  // Đang chọn một đơn / một mã ⇒ các khối của nó trên xe (kể cả pallet gộp chứa phần lẻ của mã);
  // sơ đồ tính lại (bật công tắc, đổi xe…) thì vẫn chỉ đúng nó — xem được hàng dời đi đâu
  const selFocus = useMemo(() => {
    if (!sel || !result) return null
    const s = new Set<number>()
    result.plan.groups.forEach((g, gi) => {
      const mt = result.meta[gi]
      if (g.doKey.endsWith(`|${sel.orderId}`) && (!sel.itemId || mt.itemId === sel.itemId || mt.holds?.includes(sel.itemId))) s.add(gi)
    })
    return s
  }, [sel, result])
  const shown = sel ? selFocus : focus
  const pick = (orderId: string, itemId?: string) => {
    setFocus(null)
    setSel(s => (s && s.orderId === orderId && s.itemId === itemId ? null : { orderId, itemId }))
  }

  if (!trip) return <><PageHeader title={t('Không thấy chuyến')} /><div className="p-6"><Empty icon={<AlertTriangle size={28} strokeWidth={1.5} />} title={t('Chuyến này không còn')} /></div></>

  const r = vehicle && hasCargo ? result : null
  const newTrip = () => {
    const tid = newId()
    upsertTrip({ id: tid, ...newTripLabel(trips), vehicleId: null, orderIds: [], updatedAt: 0 })
    go({ page: 'trip', id: tid })
  }

  // ── sửa XE ngay tại chỗ (xe mẫu ⇒ thành xe của tôi) ──
  const patchVehicle = (patch: Partial<Vehicle>) => {
    if (!vehicle) return
    if (vehicle.owner === 'admin') {
      const v: Vehicle = { ...vehicle, ...patch, id: newId(), owner: 'me', name: `${vehicle.name} (của tôi)` } // i18n-ok — dữ liệu lưu; tx() dịch lúc hiện
      upsertVehicle(v); upsertTrip({ ...trip, vehicleId: v.id })
      setToast(t('Đã tạo xe của bạn từ xe mẫu'))
    } else upsertVehicle({ ...vehicle, ...patch })
  }
  const pickVehicle = (vid: string) => upsertTrip({ ...trip, vehicleId: vid })
  const vehicleSharedWith = vehicle ? trips.filter(t => t.id !== trip.id && t.vehicleId === vehicle.id).length : 0

  // ── sửa MÃ HÀNG từ dòng hàng (popup `ItemSheet`): mã mẫu lưu thành mã của tôi (id mới) ⇒ thay vào các đơn của chuyến này ──
  const adoptItem = (from: Item, saved: Item) => {
    if (saved.id === from.id) return
    rawOrders.filter(o => o.lines.some(l => l.itemId === from.id))
      .forEach(o => upsertOrder({ ...o, lines: o.lines.map(l => (l.itemId === from.id ? { ...l, itemId: saved.id } : l)) }))
    setSel(s => (s?.itemId === from.id ? { ...s, itemId: saved.id } : s))
    setToast(t('Đã tạo mã của bạn từ mã mẫu'))
  }
  const setQty = (o: Order, itemId: string, qty: number) =>
    upsertOrder({ ...o, lines: o.lines.map(l => (l.itemId === itemId ? { ...l, qty: Math.max(0, Math.round(qty)) } : l)) })
  const toggleLine = (o: Order, itemId: string) => upsertOrder({
    ...o, lines: o.lines.some(l => l.itemId === itemId) ? o.lines.filter(l => l.itemId !== itemId) : [...o.lines, { itemId, qty: 0 }],
  })
  const newOrderInTrip = () => {
    const oid = newId()
    upsertOrder({ id: oid, name: nextName('Đơn', orders.map(o => o.name)), place: '', lines: [], updatedAt: 0 }) // i18n-ok — tên mặc định lưu vào dữ liệu
    upsertTrip({ ...trip, orderIds: [...trip.orderIds, oid] })
    return oid
  }
  const addCargo = () => setPickFor(rawOrders[0]?.id ?? newOrderInTrip())
  // đóng bảng chọn mã mà đơn vẫn trống (vừa bấm "Thêm hàng" / "Đơn mới" rồi thôi) ⇒ bỏ đơn đó, không để lại đơn rỗng
  const closePicker = () => {
    const o = useData.getState().orders.find(x => x.id === pickFor)
    if (o && isBlankOrder(o)) removeOrder(o.id)
    setPickFor(null)
  }
  const moveOrder = (i: number, d: -1 | 1) => {
    const ids = [...trip.orderIds]; const j = i + d
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    upsertTrip({ ...trip, orderIds: ids })
  }
  const pickOrder = rawOrders.find(o => o.id === pickFor)
  const itemColor = (itemId: string) => (colors.has(itemId) ? tint(colors.get(itemId)!) : undefined)
  const all = orderTotals(tripOrders.flatMap(o => o.lines), pallet)
  const byId = new Map(items.map(i => [i.id, i]))
  // dòng hàng đang mở popup sửa mã (`editing` = "đơn:mã")
  const editLine = (() => {
    if (!editing) return null
    const i = editing.indexOf(':')
    const o = rawOrders.find(x => x.id === editing.slice(0, i)), it = byId.get(editing.slice(i + 1))
    return o && it ? { o, it } : null
  })()
  const notes = [...(r?.errors ?? []), ...(r?.warnings ?? [])]
  // nhãn trên 3D cho đơn / mã đang chọn: tên · nằm ở khối nào · đoạn nào của thùng (tính từ đầu thùng, phía cabin)
  const selName = sel && tx((sel.itemId ? byId.get(sel.itemId)?.name : rawOrders.find(o => o.id === sel.orderId)?.name) ?? '')
  const selWhere = (() => {
    if (!sel || !r || !selFocus) return null
    const boxes = r.plan.placed.filter(b => selFocus.has(b.group))
    if (!boxes.length) return { what: t('chưa lên xe'), range: '' }
    const rows = r.count.filter(c => selFocus.has(c.group))
    const pal = rows.filter(c => c.unit === 'pallet')
    const mine = pal.filter(c => !sel.itemId || r.meta[c.group].itemId === sel.itemId).reduce((s, c) => s + c.placed, 0)
    const sharedRows = sel.itemId ? pal.filter(c => r.meta[c.group].itemId == null) : []
    const shared = sharedRows.reduce((s, c) => s + c.placed, 0)
    const sharedN = sharedRows.reduce((s, c) => s + (r.meta[c.group].mix?.find(x => x.itemId === sel.itemId)?.n ?? 0) * c.placed, 0)
    const loose = rows.filter(c => c.unit === 'thùng') // i18n-ok — đơn vị của thuật toán
    const n = loose.reduce((s, c) => s + c.placed, 0)
    const what = [
      mine ? t('{n} pallet', { n: fmtInt(mine) }) : '',
      shared ? (sharedN ? t('{c} thùng trong {n} pallet gộp', { c: fmtInt(sharedN), n: fmtInt(shared) }) : t('trong {n} pallet gộp', { n: fmtInt(shared) })) : '',
      n ? t('{n} thùng', { n: fmtInt(n) }) + (loose.some(c => c.onTopOfOthers) ? ' ' + t('(có thùng trên nóc)') : '') : '',
    ].filter(Boolean).join(' + ')
    const x0 = Math.min(...boxes.map(b => b.x)), x1 = Math.max(...boxes.map(b => b.x + b.l))
    return { what, range: t('từ đầu thùng {from}–{to} m', { from: m(x0), to: m(x1) }) }
  })()

  return (
    <div className="flex min-h-[100dvh] flex-col lg:h-[100dvh]">
      {/* ── thanh trên navy: nút danh mục (3 vạch) · chuyến đang mở ▾ + chuyến mới · … · Login · logo MAL ── */}
      <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-1 bg-navy-950 pl-1 pr-3 text-white sm:h-14 sm:gap-2 sm:pl-2 sm:pr-4">
        <MainMenu onPanel={setPanel} onImport={() => setImporting('menu')} />
        <TripSwitcher trip={trip} trips={trips} onRename={name => upsertTrip({ ...trip, name })} onDelete={setDelTrip}
          onAll={() => setPanel('trips')} onNew={newTrip} />
        <Button variant="primary" onClick={newTrip} aria-label={t('Chuyến mới')} title={t('Tạo chuyến mới')} className="w-10 shrink-0 px-0 sm:w-auto sm:px-3.5"><Plus size={18} /><span className="hidden sm:inline">{t('Chuyến mới')}</span></Button>
        <nav className="ml-3 hidden items-center gap-0.5 xl:flex">
          {MENU.map(mn => (
            <button key={mn.p} onClick={() => setPanel(mn.p)} className="flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white">
              <mn.icon size={17} strokeWidth={1.75} />{t(mn.label)}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-4">
          <span className="flex items-center gap-1 sm:gap-2">
            <LangSwitch />
            <AccountButton onData={() => setPanel('account')} />
          </span>
          <a href="#/trips" aria-label={t('MAL Cargo, về bàn xếp xe')} className="shrink-0"><Logo dark compact /></a>
        </div>
      </header>

      <div className="lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(380px,440px)_1fr]">
        {/* ── BẢN VẼ: dải thông số xe + 3D + khung tên ── */}
        {/* toàn màn hình: khung 3D phủ kín màn (máy có Fullscreen API thì ẩn luôn thanh trình duyệt) */}
        <section data-scene className={full
          ? 'fixed inset-0 z-40 flex flex-col bg-[#e7ecf2] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]'
          : cx('sticky top-12 z-10 flex flex-col bg-[#e7ecf2] sm:top-14 lg:relative lg:top-0 lg:order-2 lg:h-full', kb && 'max-lg:relative max-lg:top-0')}>
          <SpecStrip vehicle={vehicle} pallet={pallet} keep={full} onOpen={more => setSpec({ more })} onKind={k => patchVehicle({ kind: k })}
            lightOwn={tripOrders.some(o => o.lines.some(l => l.qty > 0 && l.item.light)) ? !!trip.lightOwnPallet : null}
            onLightOwn={v => upsertTrip({ ...trip, lightOwnPallet: v })} onPallet={() => setPalletOpen(true)} />
          {/* điện thoại: khung 3D cao cố định (nửa màn trừ một hàng thông số) — dải thông số xuống dòng không bóp khung */}
          <div className={cx('relative min-h-0', full ? 'flex-1' : 'h-[calc(50vh-56px)] min-h-[264px] sm:h-[calc(50vh-48px)] lg:h-auto lg:flex-1')}>
            <Scene className="h-full w-full" truck={vehicle ? { l: vehicle.l, w: vehicle.w, h: vehicle.h, container: vehicle.container, plate: vehicle.plate } : null}
              plan={plan} meta={result?.meta} colors={colors} prints={prints} step={step} focus={shown} focusItem={sel?.itemId ?? null} view={view} walls={walls} />

            <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
              <TitleBlock r={r} busy={busy} error={error} hasCargo={hasCargo} vehicle={vehicle} tripName={trip.name}
                orders={tripOrders.map(o => ({ id: o.id, name: o.name, cartons: orderTotals(o.lines, pallet).cartons }))}
                sug={suggestion && vehicle && suggestion !== vehicle.id ? vehicles.find(v => v.id === suggestion) : undefined}
                noneFits={!suggestion} onPick={vid => { pickVehicle(vid); setToast(t('Đã đổi xe')) }} />
              {/* điện thoại: nút diễn giải chỉ biểu tượng, xếp dưới nút góc nhìn — dải số liệu bên trái cần đủ bề ngang */}
              <div className="flex shrink-0 flex-col-reverse items-end gap-2 sm:flex-row">
                {r && r.plan.placed.length > 0 && (
                  <button type="button" onClick={() => setExplain(true)} aria-haspopup="dialog" aria-label={t('Diễn giải')} title={vehicle?.kind === 'pallet' ? t('Bao nhiêu pallet, pallet lẻ nào gộp chung') : t('Khối mấy lớp, lẻ trên khối mấy thùng')}
                    className="hit pointer-events-auto flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 text-[12px] font-semibold text-slate-800 hover:bg-slate-50">
                    <Table2 size={16} /><span className="max-sm:hidden">{t('Diễn giải')}</span>
                  </button>
                )}
                <ViewMenu view={view.preset} walls={walls} onView={p => setView(v => ({ preset: p, n: v.n + 1 }))} onWalls={() => setWalls(w => (w === 'open' ? 'glass' : 'open'))} />
                <button type="button" onClick={() => setFull(!full)} aria-pressed={full} aria-label={full ? t('Thoát toàn màn hình') : t('Toàn màn hình')} title={full ? t('Thoát toàn màn hình') : t('Toàn màn hình')}
                  className="hit pointer-events-auto grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-white text-slate-800 hover:bg-slate-50">
                  {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              </div>
            </div>

            {/* đáy bản vẽ, xếp chồng không đè nhau: thông báo · nhãn đơn / mã đang chọn · thanh bước xếp */}
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col items-center gap-2 lg:inset-x-6 lg:bottom-5">
              {toast && <div className="flex max-w-full items-center gap-2 rounded-md bg-navy-950 px-4 py-2 text-[13px] font-medium text-white shadow-pop" style={{ animation: 'sheet-up .2s' }}>
                {/* báo không chở hết thì đừng gắn dấu ✓ */}
                {toast === t('Không xe nào chở hết, tạm chọn xe lớn nhất') ? <AlertTriangle size={16} className="shrink-0 text-amber-300" /> : <Check size={16} className="shrink-0" />}{toast}
              </div>}
              {sel && selName && (
                <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-md border-[1.5px] border-brand-500 bg-white py-0.5 pl-2.5 text-[13px] text-slate-800 lg:max-w-2xl">
                  <Crosshair size={15} className="shrink-0 text-brand-600" />
                  <span className="min-w-0 break-words leading-snug"><b className="font-semibold text-slate-900">{selName}</b>{selWhere && <span className="num"> · {selWhere.what}{selWhere.range && <> · <span className="whitespace-nowrap">{selWhere.range}</span></>}</span>}</span>
                  <IconButton label={t('Bỏ chọn')} onClick={() => setSel(null)} className="shrink-0 text-slate-500"><X size={16} /></IconButton>
                </div>
              )}
              {plan && stepCount > 0 && (
                <div className="pointer-events-auto flex w-full items-center gap-3 rounded-md border border-slate-300 bg-white px-2 py-1.5 lg:max-w-2xl">
                  <IconButton label={playing ? t('Dừng') : t('Xem xếp từng bước')} className="hit h-9 w-9 bg-brand-500 text-white hover:bg-brand-600 hover:text-white"
                    onClick={() => { if (!playing && step == null) setStep(0); setPlaying(p => !p) }}>
                    {playing ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
                  </IconButton>
                  <input type="range" className="steps min-w-0 flex-1" min={1} max={stepCount} value={step ?? stepCount} aria-label={t('Bước xếp')}
                    style={{ ['--p' as string]: `${(((step ?? stepCount) - 1) / Math.max(1, stepCount - 1)) * 100}%` }}
                    onChange={e => { setPlaying(false); const v = Number(e.target.value); setStep(v >= stepCount ? null : v) }} />
                  <span className="num w-[92px] shrink-0 pr-1 text-right text-[13px] font-semibold text-slate-700">
                    {step == null ? t('Đủ {n} bước', { n: stepCount }) : t('Bước {step}/{total}', { step, total: stepCount })}
                  </span>
                </div>
              )}
            </div>

            {spec && (
              <SpecPopup vehicle={vehicle} vehicles={vehicles} suggestion={suggestion} fits={hasCargo ? fits : null} sharedWith={vehicleSharedWith}
                more={spec.more} onMore={more => setSpec({ more })}
                onClose={() => setSpec(null)} onPick={pickVehicle} onPatch={patchVehicle}
                onEdit={v => setEditVehicle({ v })} onAdd={() => setEditVehicle({ v: null })} />
            )}
          </div>
        </section>

        {/* ── CỘT KHAI HÀNG ── */}
        <aside className="relative bg-canvas pb-10 lg:order-1 lg:overflow-y-auto lg:border-r lg:border-slate-200">
          {!!notes.length && (
            <ul className="mt-3 space-y-1 border-y border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900 sm:mx-3 sm:rounded-lg sm:border">
              {notes.map(w => <li key={w} className="flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{tx(w)}</li>)}
            </ul>
          )}

          <Block title={t('Hàng trên xe')} open={open.cargo} onToggle={() => setOpen(o => ({ ...o, cargo: !o.cargo }))}
            summary={hasCargo ? (
              <span className="flex flex-wrap gap-x-3">
                <SumChip label={t('Đơn')} value={fmtInt(rawOrders.length)} /><SumChip label={t('Thùng')} value={fmtInt(all.cartons)} />
                <SumChip label={t('Nặng')} value={fmtKgShort(all.kg)} /><SumChip label={t('Khối')} value={fmtM3(all.m3)} />
              </span>
            ) : t('Chưa có hàng')}>
            {!rawOrders.length ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-slate-700">{t('Xe chở hàng gì? Chọn mã hàng rồi nhập số thùng, hàng hiện lên xe ngay.')}</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <Button variant="primary" onClick={addCargo}><Plus size={18} />{t('Thêm hàng')}</Button>
                  {!phone && <Button onClick={() => setImporting('trip')}><Upload size={17} />{t('Nhập đơn từ Excel')}</Button>}
                </div>
              </div>
            ) : (
              <div className="space-y-3 bg-canvas p-3 sm:rounded-b-lg">
                {rawOrders.map((o, i) => (
                  <OrderBlock key={keyOf(o.id)} o={o} i={i} count={rawOrders.length} tot={orderTotals(tripOrders[i].lines, pallet)}
                    selected={sel?.orderId === o.id && !sel.itemId} onSelect={() => pick(o.id)}
                    onEdit={() => setEditOrder(o.id)} onMove={d => moveOrder(i, d)}
                    onOpenPage={() => go({ page: 'order', id: o.id, back: `trip:${trip.id}` })}
                    onRemove={() => setUnlink(o)}
                    onAddItem={() => setPickFor(o.id)}>
                    {o.lines.map(l => {
                      const it = byId.get(l.itemId)
                      const key = `${o.id}:${l.itemId}`, rk = `${keyOf(o.id)}:${l.itemId}`
                      if (!it) return (
                        <div key={rk} className="flex items-center gap-3 px-4 py-2 text-sm text-red-700">
                          <AlertTriangle size={18} /><span className="flex-1">{t('Mã hàng này đã bị xoá')}</span>
                          <IconButton label={t('Bỏ dòng')} onClick={() => toggleLine(o, l.itemId)}><X size={16} /></IconButton>
                        </div>
                      )
                      const isSel = sel?.orderId === o.id && sel.itemId === l.itemId
                      return (
                        <div key={rk} className={cx('border-t border-slate-100', isSel && 'bg-brand-50 shadow-[inset_3px_0_0_#1a66ff]')}>
                          {/* tên hàng chiếm trọn dòng trên (xuống dòng được, không cắt chữ) — bấm để chỉ mã trên xe;
                              nút "Sửa" = popup thông tin mã. Dòng dưới: quy cách xếp (thùng/pallet · lớp · kg) + số thùng */}
                          <div className="py-1.5 pl-3 pr-1">
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => pick(o.id, l.itemId)} aria-pressed={isSel} title={t('Xem mã này nằm đâu trên xe')}
                                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-0.5 pr-1 text-left hover:bg-slate-50">
                                <BoxGlyph w={it.w} h={it.h} light={it.light} color={itemColor(it.id)} />
                                <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug text-slate-900">{tx(it.name)}</span>
                              </button>
                              <button type="button" aria-label={t('Sửa {name}', { name: tx(it.name) })} aria-haspopup="dialog" onClick={() => setEditing(key)}
                                className="tap inline-flex shrink-0 items-center gap-1 rounded-md px-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-100">
                                <Pencil size={14} />{t('Sửa')}
                              </button>
                            </div>
                            <div className="flex items-center gap-2 pl-[42px]">
                              <span className="num min-w-0 flex-1 text-[12px] leading-snug text-slate-600">
                                {specParts(it).map((s, i, a) => <Fragment key={i}><span className="whitespace-nowrap">{s}{i < a.length - 1 && ' ·'}</span>{' '}</Fragment>)}
                                {it.light && <Badge tone="amber" className="ml-1">{t('nhẹ')}</Badge>}
                              </span>
                              <div className="flex shrink-0 items-center">
                              <IconButton label={t('Bớt 1')} onClick={() => setQty(o, l.itemId, l.qty - 1)} disabled={l.qty <= 0}><Minus size={15} /></IconButton>
                              <input inputMode="numeric" value={l.qty || ''} placeholder={t('Số thùng')} aria-label={t('Số thùng {name}', { name: tx(it.name) })}
                                onChange={e => setQty(o, l.itemId, Number(e.target.value.replace(/\D/g, '')) || 0)}
                                className={cx('tap num w-[68px] rounded-md border px-1.5 text-center text-base font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:text-sm',
                                  l.qty > 0 ? 'border-slate-300 bg-white' : 'border-amber-400 bg-amber-50 placeholder:text-[12px] placeholder:font-normal placeholder:text-amber-800')} />
                              <IconButton label={t('Thêm 1')} onClick={() => setQty(o, l.itemId, l.qty + 1)}><Plus size={15} /></IconButton>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </OrderBlock>
                ))}
                <button onClick={() => setPickOrders(true)} className="tap flex w-full items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-slate-400 px-4 text-[13px] font-semibold text-slate-700 hover:border-slate-500 hover:bg-white">
                  <Plus size={16} />{t('Thêm đơn / điểm giao khác')}
                </button>
                {!phone && (
                  <button onClick={() => setImporting('trip')} className="tap flex w-full items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-slate-400 px-4 text-[13px] font-semibold text-slate-700 hover:border-slate-500 hover:bg-white">
                    <Upload size={16} />{t('Nhập đơn từ Excel')}
                  </button>
                )}
              </div>
            )}
          </Block>

          <Block title={t('Bảng đếm chân')} open={open.count} onToggle={() => setOpen(o => ({ ...o, count: !o.count }))}
            summary={r ? t('{n} dòng, thứ tự xếp từ cabin ra cửa', { n: r.count.length }) : t('Có khi đã xếp hàng lên xe')}>
            <CountSheet r={r} colors={colors} focus={shown} tripName={trip.name} vehicle={vehicle}
              onFocus={gi => {
                setSel(null)
                setFocus(f => {
                  const n = new Set(sel ? [] : f ?? []); if (n.has(gi)) n.delete(gi); else n.add(gi)
                  return n.size ? n : null
                })
              }}
              onToast={setToast} />
          </Block>
        </aside>
      </div>

      <PalletSheet open={palletOpen} onClose={() => setPalletOpen(false)} />
      <ExplainPopup open={explain} onClose={() => setExplain(false)} r={r} vehicle={vehicle} items={items} colors={colors} tripName={trip.name} onToast={setToast} />
      <VehicleSheet open={!!editVehicle} vehicle={editVehicle?.v ?? null} onClose={() => setEditVehicle(null)}
        onSaved={nv => { if (!editVehicle?.v || editVehicle.v.id === trip.vehicleId) pickVehicle(nv.id) }} />
      <OrderSheet order={rawOrders.find(o => o.id === editOrder) ?? null} items={items} colorOf={itemColor} onClose={() => setEditOrder(null)}
        onSave={(o, p) => upsertOrder({ ...o, ...p })} />
      {/* sửa mã từ dòng hàng — popup (user 28/10: "để trong hàng nhìn hơi rối") */}
      <ItemSheet open={!!editLine} item={editLine?.it ?? null} onClose={() => setEditing(null)}
        onSaved={saved => { if (editLine) adoptItem(editLine.it, saved) }}
        onUnlink={() => { if (editLine) toggleLine(editLine.o, editLine.it.id) }} />
      <OrderPicker open={pickOrders} onClose={() => setPickOrders(false)} inTrip={trip.orderIds}
        onAdd={ids => upsertTrip({ ...trip, orderIds: [...trip.orderIds, ...ids] })}
        onNew={() => { setPickOrders(false); setPickFor(newOrderInTrip()) }} />
      {pickOrder && (
        <ItemPicker open onClose={closePicker} picked={new Set(pickOrder.lines.map(l => l.itemId))}
          onToggle={it => toggleLine(useData.getState().orders.find(o => o.id === pickOrder.id) ?? pickOrder, it.id)} />
      )}
      <Confirm open={!!delTrip} onClose={() => setDelTrip(null)} title={t('Xoá {name}?', { name: tx(delTrip?.name ?? '') })} body={t('Các đơn trong chuyến vẫn giữ nguyên, xem lại ở Đơn hàng.')}
        onOk={() => { if (!delTrip) return; removeTrip(delTrip.id); if (delTrip.id === trip.id) go({ page: 'trips' }); else setToast(t('Đã xoá {name}', { name: tx(delTrip.name) })) }} />

      <Confirm open={!!unlink} onClose={() => setUnlink(null)} okText={t('Gỡ khỏi chuyến')} title={t('Gỡ {name} khỏi chuyến?', { name: tx(unlink?.name ?? '') })}
        body={t('Hàng của đơn này rời khỏi xe. Đơn vẫn còn trong Đơn hàng, thêm lại lúc nào cũng được.')}
        onOk={() => { if (unlink) upsertTrip({ ...trip, orderIds: trip.orderIds.filter(x => x !== unlink.id) }) }} />
      <ImportSheet open={!!importing} onClose={() => setImporting(null)} onDone={setToast}
        start={importing === 'trip' ? 'orders' : 'items'} trip={importing === 'trip' ? { id: trip.id, name: trip.name } : undefined} />
      <Panel open={!!panel} onClose={() => setPanel(null)}>
        {panel === 'items' && <ItemsPage />}
        {panel === 'vehicles' && <VehiclesPage />}
        {panel === 'orders' && <OrdersPage />}
        {panel === 'trips' && <TripsPage />}
        {panel === 'account' && <AccountPage />}
      </Panel>
    </div>
  )
}

// ── Chuyến đang mở ▾ (cạnh nút "+"): xem lại / mở / đổi tên / xoá các chuyến cũ ─────────────
function TripSwitcher({ trip, trips, onRename, onDelete, onAll, onNew }: {
  trip: Trip; trips: Trip[]; onRename: (name: string) => void; onDelete: (t: Trip) => void; onAll: () => void; onNew: () => void
}) {
  const orders = useData(s => s.orders)
  const pallet = useData(s => s.pallet)
  const items = useAllItems()
  const vehicles = useAllVehicles()
  const [renaming, setRenaming] = useState(false)
  const rows = useMemo(() => [...trips].sort((a, b) => b.updatedAt - a.updatedAt).map(tr => {
    const os = tr.orderIds.map(id => orders.find(o => o.id === id)).filter((o): o is Order => !!o).map(o => resolveOrder(o, items))
    return { tr, v: findVehicle(vehicles, tr.vehicleId), tot: orderTotals(os.flatMap(o => o.lines), pallet) }
  }), [trips, orders, items, vehicles, pallet])
  return (
    <Popover className="min-w-0" panelClass="w-[330px] max-w-[calc(100vw-24px)] overflow-hidden"
      trigger={({ open, toggle }) => (
        <h1 className="min-w-0">
          <button onClick={() => { setRenaming(false); toggle() }} aria-expanded={open} aria-label={t('Chuyến đang mở: {name}. Bấm để xem các chuyến', { name: tx(trip.name) })}
            className="hit flex h-9 w-full min-w-0 max-w-[170px] items-center gap-1 rounded-md border border-white/20 px-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/10 sm:max-w-[260px] sm:px-2.5 sm:text-sm">
            <span className="truncate">{tx(trip.name)}</span><ChevronDown size={16} className={cx('shrink-0 text-slate-300 transition-transform', open && 'rotate-180')} />
          </button>
        </h1>
      )}>
      {close => (
        <>
          <div className="flex items-center gap-1 border-b border-slate-200 py-1 pl-3 pr-1">
            {renaming ? (
              <input autoFocus defaultValue={trip.name} aria-label={t('Tên chuyến')}
                onBlur={e => { e.target.value.trim() && onRename(e.target.value.trim()); setRenaming(false) }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false) }}
                // chữ < 16px thì iPhone tự phóng to cả trang khi chạm vào ô
                className="tap min-w-0 flex-1 rounded-md border border-brand-500 px-2 text-base font-semibold outline-none ring-2 ring-brand-100 sm:text-sm" />
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-700">{t('Các chuyến')} · {rows.length}</span>
                <Button variant="ghost" className="text-[13px] text-brand-700" onClick={() => setRenaming(true)}><Pencil size={14} />{t('Đổi tên chuyến này')}</Button>
              </>
            )}
          </div>
          <div className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto">
            {rows.map(({ tr, v, tot }) => {
              const cur = tr.id === trip.id
              return (
                <div key={tr.id} className={cx('flex items-center', cur && 'bg-brand-50')}>
                  <a href={`#/trip/${tr.id}`} onClick={close} aria-current={cur ? 'page' : undefined} className="min-w-0 flex-1 px-3 py-2 hover:bg-slate-50">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <span className="min-w-0 break-words">{tx(tr.name)}</span>{cur && <Badge tone="blue">{t('đang mở')}</Badge>}
                    </span>
                    <span className="num block break-words text-[12px] leading-snug text-slate-600">{tr.code && tr.code !== tr.name && `${tr.code} · `}{v ? tx(v.name) : t('Chưa chọn xe')} · {t('{n} thùng', { n: fmtInt(tot.cartons) })} · {fmtKgShort(tot.kg)}</span>
                  </a>
                  {isSample(tr.id)
                    ? <span className="mr-2 w-[60px] shrink-0 text-right" title={t('Chuyến mặc định của app, không xoá được')}><Badge>{t('mặc định')}</Badge></span>
                    : <IconButton label={t('Xoá {name}', { name: tx(tr.name) })} onClick={() => { close(); onDelete(tr) }} className="mr-1 text-slate-500 hover:text-red-700"><Trash2 size={16} /></IconButton>}
                </div>
              )
            })}
          </div>
          <div className="flex gap-2 border-t border-slate-200 p-2">
            <Button variant="primary" className="flex-1" onClick={() => { close(); onNew() }}><Plus size={17} />{t('Chuyến mới')}</Button>
            <Button onClick={() => { close(); onAll() }}><Table2 size={16} />{t('Dạng bảng')}</Button>
          </div>
        </>
      )}
    </Popover>
  )
}

// ── Nút Danh mục 3 vạch (góc trái): mở các danh mục ngay trên bàn xếp xe ─────────────
function MainMenu({ onPanel, onImport }: { onPanel: (p: PanelName) => void; onImport: () => void }) {
  const isAdmin = useAuth(s => s.isAdmin)
  const phone = usePhone()
  return (
    <Popover className="shrink-0" panelClass="w-[270px] max-w-[calc(100vw-16px)] overflow-hidden py-1"
      trigger={({ open, toggle }) => (
        <button onClick={toggle} aria-expanded={open} aria-label={t('Danh mục')} title={t('Danh mục')}
          className="grid h-11 w-10 place-items-center rounded-md text-slate-200 transition-colors hover:bg-white/10 hover:text-white sm:w-11"><Menu size={22} /></button>
      )}>
      {close => (
        <>
          {[...MENU, { p: 'trips' as const, label: 'Các chuyến', icon: Table2 }].map(mn => ( // i18n-key
            <MenuItem key={mn.p} icon={<mn.icon size={18} strokeWidth={1.75} />} onClick={() => { close(); onPanel(mn.p) }}>{t(mn.label)}</MenuItem>
          ))}
          <div className="my-1 border-t border-slate-200" />
          {!phone && <MenuItem icon={<FileSpreadsheet size={18} strokeWidth={1.75} />} onClick={() => { close(); onImport() }}>{t('Nhập từ Excel')}</MenuItem>}
          <MenuItem icon={<UserRound size={18} strokeWidth={1.75} />} onClick={() => { close(); onPanel('account') }}>{t('Tài khoản & dữ liệu')}</MenuItem>
          {isAdmin && (
            <MenuItem icon={<Users size={18} strokeWidth={1.75} />} onClick={() => { close(); onPanel('vehicles') }}>
              <span className="flex-1">{t('Mẫu chung')}</span><Badge tone="blue">Admin</Badge>
            </MenuItem>
          )}
          <a href="https://mal.com.vn" target="_blank" rel="noreferrer" className="mx-2 mb-1 mt-2 block rounded-md bg-navy-950 px-3 py-2.5 text-[12px] leading-snug text-slate-300">
            {t('Một sản phẩm của')} <span className="font-semibold text-white">SUPPLYC</span>{t(', phần mềm kho & vận tải')}
          </a>
        </>
      )}
    </Popover>
  )
}

/** Chữ G nhiều màu của Google — đúng cách Google yêu cầu cho nút đăng nhập. */
const GoogleG = () => (
  <svg viewBox="0 0 48 48" className="h-[18px] w-[18px] shrink-0" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z" />
    <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.2z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
  </svg>
)

// ── Login (chữ) + hướng dẫn khi rê chuột / chạm · đã đăng nhập: ảnh tài khoản + trạng thái đồng bộ ──
function AccountButton({ onData }: { onData: () => void }) {
  const { status, user, isAdmin, sync } = useAuth()
  const [err, setErr] = useState<string | null>(null)
  if (status === 'in' && user) {
    return (
      <Popover align="right" panelClass="w-[290px] max-w-[calc(100vw-24px)] overflow-hidden"
        trigger={({ open, toggle }) => (
          <button onClick={toggle} aria-expanded={open} aria-label={t('Tài khoản {name}', { name: user.name })} title={user.email}
            className="hit grid h-9 w-9 place-items-center overflow-hidden rounded-full border-2 border-white/30 bg-brand-500 text-sm font-bold text-white hover:border-white/60">
            {user.avatar ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : (user.name || user.email).slice(0, 1).toUpperCase()}
          </button>
        )}>
        {close => (
          <>
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2"><span className="truncate text-[15px] font-semibold">{user.name}</span>{isAdmin && <Badge tone="blue">Admin</Badge>}</div>
              <div className="truncate text-[13px] text-slate-600">{user.email}</div>
              <div className={cx('mt-2 flex items-center gap-1.5 text-[12px]', sync === 'error' ? 'text-red-700' : 'text-slate-700')}>
                {sync === 'error' ? <><CloudOff size={14} />{t('Chưa lưu được lên tài khoản, sẽ thử lại khi có thay đổi')}</>
                  : sync === 'saving' ? <><Loader2 size={14} className="animate-spin" />{t('Đang lưu lên tài khoản…')}</>
                  : <><Check size={14} className="text-emerald-700" />{t('Dữ liệu đã lưu trên tài khoản')}</>}
              </div>
            </div>
            <div className="py-1">
              <MenuItem icon={<UserRound size={17} />} onClick={() => { close(); onData() }}>{t('Tài khoản & dữ liệu')}</MenuItem>
              <MenuItem icon={<LogOut size={17} />} onClick={() => { close(); signOut() }}>{t('Đăng xuất')}</MenuItem>
            </div>
          </>
        )}
      </Popover>
    )
  }
  const off = status === 'off'
  return (
    <Popover hover align="right" panelClass="w-[300px] max-w-[calc(100vw-24px)] p-4"
      trigger={({ open, toggle }) => (
        <button onClick={toggle} aria-expanded={open} disabled={status === 'loading'}
          className="hit flex h-9 items-center rounded-md border border-white/30 px-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60 sm:px-3">
          {t('Login')}
        </button>
      )}>
      {() => (
        <>
          <div className="flex items-center gap-2"><span className="text-[15px] font-semibold">{t('Đăng nhập bằng Google')}</span>{off && <Badge tone="amber">{t('sắp có')}</Badge>}</div>
          <ul className="mt-2 space-y-1 text-[13px] text-slate-800">
            <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-brand-600" />{t('Dùng cùng dữ liệu trên điện thoại và máy tính')}</li>
            <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-brand-600" />{t('Không mất dữ liệu khi xoá trình duyệt, đổi máy')}</li>
            <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-brand-600" />{t('Dữ liệu đang có trên máy này tự chuyển lên tài khoản')}</li>
          </ul>
          {off ? (
            <>
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{t('Hiện dữ liệu chỉ nằm trong trình duyệt trên máy này. Nên tải file sao lưu định kỳ.')}</p>
              <Button className="mt-3 w-full" onClick={onData}>{t('Sao lưu dữ liệu')}</Button>
            </>
          ) : (
            <>
              <button onClick={() => signInGoogle().catch(e => setErr(String(e?.message ?? e)))}
                className="tap mt-3 flex w-full items-center justify-center gap-2.5 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50">
                <GoogleG />{t('Tiếp tục với Google')}
              </button>
              {err && <p className="mt-2 text-[12px] text-red-700">{err}</p>}
              <p className="mt-2 text-[12px] text-slate-600">
                {t('Không đăng nhập vẫn dùng đầy đủ, dữ liệu lưu trên máy này.')} <a href="/privacy.html" target="_blank" rel="noreferrer" className="text-brand-700 underline">{t('Chính sách bảo mật')}</a>
              </p>
            </>
          )}
        </>
      )}
    </Popover>
  )
}

// ── Dải thông số xe ở đầu bản vẽ: đọc một dòng là biết đang cấu hình gì; xá/pallet một chạm ──────
// Không đủ chỗ thì XUỐNG DÒNG (không cắt chữ, không đẩy nút ra ngoài mép). `lightOwn` null = không hiện
// công tắc hàng nhẹ (chuyến không có hàng nhẹ).
function SpecStrip({ vehicle, pallet, lightOwn, keep, onOpen, onKind, onLightOwn, onPallet }: {
  vehicle?: Vehicle; pallet: { l: number; w: number; maxH: number }; lightOwn: boolean | null; keep: boolean
  onOpen: (more: boolean) => void; onKind: (k: VehicleKind) => void; onLightOwn: (v: boolean) => void; onPallet: () => void
}) {
  const chip = 'hit flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[13px] text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-50'
  // Đổi Thùng rời ↔ Pallet không được làm khung 3D đổi cỡ (chủ dự án 29/10): nút riêng của xe pallet vẫn GIỮ CHỖ
  // khi xếp rời (vô hình, cuối hàng nên chỉ thấy khoảng trống) — dải thông số cao như nhau. Điện thoại (ngoài toàn
  // màn hình) khung 3D cao cố định, dải thông số cao thêm thì đẩy phần dưới xuống ⇒ không cần giữ chỗ.
  const palOnly = vehicle?.kind === 'pallet' ? '' : keep ? 'invisible' : 'max-lg:hidden lg:invisible'
  return (
    <div className="flex min-h-[56px] shrink-0 flex-wrap items-center gap-2 border-b border-slate-300 bg-white px-3 py-2 sm:min-h-[48px] sm:gap-1.5 sm:py-1.5">
      {!vehicle ? (
        <button onClick={() => onOpen(false)} className={chip}><Truck size={16} />{t('Chọn xe')}</button>
      ) : (
        <>
          {/* điện thoại: chiếm phần còn lại của hàng đầu, tên dài thì xuống dòng; máy tính: rộng theo chữ */}
          <button onClick={() => onOpen(false)} aria-label={t('Đổi xe')} className={cx(chip, 'min-w-0 flex-1 font-semibold sm:flex-none')}>
            <span className="max-sm:hidden"><TruckGlyph pallet={vehicle.kind === 'pallet'} small /></span>
            <span className="min-w-0 text-left leading-tight">
              <span className="block break-words sm:whitespace-nowrap">{tx(vehicle.name)}</span>
              {/* điện thoại: lòng thùng + tải gộp vào dòng phụ */}
              <span className="num block text-[11px] font-normal text-slate-600 sm:hidden">
                <span className="whitespace-nowrap">{m(vehicle.l)} × {m(vehicle.w)} × {m(vehicle.h)} m</span>
                {vehicle.payloadKg != null && <> · <span className="whitespace-nowrap">{fmtKgShort(vehicle.payloadKg)}</span></>}
              </span>
            </span>
            <ChevronDown size={15} className="ml-auto shrink-0 text-slate-500" />
          </button>
          <button onClick={() => onOpen(true)} className={cx(chip, 'max-sm:hidden')} title={t('Lòng thùng dài × rộng × cao')}>
            <span className="text-slate-600">{t('Lòng')}</span><span className="num font-semibold">{m(vehicle.l)} × {m(vehicle.w)} × {m(vehicle.h)} m</span>
          </button>
          <button onClick={() => onOpen(true)} className={cx(chip, 'max-sm:hidden')}>
            <span className="text-slate-600">{t('Tải')}</span><span className="num font-semibold">{vehicle.payloadKg != null ? fmtKgShort(vehicle.payloadKg) : '—'}</span>
          </button>
          <div className="flex h-9 shrink-0 rounded-md border border-slate-300 bg-slate-100 p-0.5" role="group" aria-label={t('Cách chất xếp')}>
            {(['loose', 'pallet'] as const).map(k => (
              <button key={k} onClick={() => k !== vehicle.kind && onKind(k)} aria-pressed={vehicle.kind === k}
                className={cx('hit rounded-[5px] px-2.5 text-[13px] font-semibold transition-colors',
                  vehicle.kind === k ? 'border border-slate-300 bg-white text-slate-900' : 'border border-transparent text-slate-600 hover:text-slate-900')}>
                {k === 'loose' ? t('Thùng rời') : 'Pallet'}
              </button>
            ))}
          </div>
          {/* cài pallet ngay cạnh nút chọn Pallet (chủ dự án 29/10) — cỡ chân chỉ hiện ở màn rộng (dải giữ một hàng) */}
          <button onClick={onPallet} aria-label={t('Cài đặt pallet')} title={t('Cài đặt pallet')} className={cx(chip, 'px-2', palOnly)}>
            <Settings size={15} className="text-brand-700" />
            <span className="num font-semibold max-2xl:hidden">{m(pallet.l)} × {m(pallet.w)} m</span>
            <span className="num text-slate-600 max-2xl:hidden">· ≤ {fmtDec(pallet.maxH / 1000, 2)} m</span>
          </button>
          {lightOwn != null && (
            <button role="switch" aria-checked={lightOwn} onClick={() => onLightOwn(!lightOwn)}
              title={lightOwn ? t('Phần lẻ hàng nhẹ đứng pallet riêng') : t('Phần lẻ hàng nhẹ dồn lên trên cùng pallet gộp')}
              className={cx(chip, 'gap-2 font-semibold max-sm:w-full max-sm:justify-between', palOnly)}>
              {t('Hàng nhẹ: pallet riêng')}
              <span className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', lightOwn ? 'bg-brand-500' : 'bg-slate-300')}>
                <span className={cx('absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform', lightOwn && 'translate-x-4')} />
              </span>
            </button>
          )}
          <button onClick={() => onOpen(true)} aria-label={t('Chỉnh thông số thùng xe')} title={t('Chỉnh thông số thùng xe')} className={cx(chip, 'ml-auto text-brand-700 max-sm:hidden')}>
            <SlidersHorizontal size={16} />
          </button>
        </>
      )}
    </div>
  )
}

// ── Khung tên GỌN (góc trên trái): một dải mảnh, chạm để mở chi tiết ─────────────
function TitleBlock({ r, busy, error, hasCargo, vehicle, tripName, orders, sug, noneFits, onPick }: {
  r: TripResult | null; busy: boolean; error: string | null; hasCargo: boolean; vehicle?: Vehicle; tripName: string
  orders: { id: string; name: string; cartons: number }[]
  sug?: Vehicle; noneFits: boolean; onPick: (id: string) => void
}) {
  const [more, setMore] = useState(false)
  const frame = 'pointer-events-auto border-[1.5px] border-navy-950 bg-white text-navy-950'
  if (!hasCargo) return <div className={cx(frame, 'px-2.5 py-1.5 text-[12px] font-semibold')}>{t('Chưa có hàng trên xe')}</div>
  if (error) return <div className={cx(frame, 'px-2.5 py-1.5 text-[12px] text-red-800')}>{t('Lỗi khi tính: {error}', { error: tx(error) })}</div>
  if (!r || !vehicle) return <div className={cx(frame, 'flex items-center gap-2 px-2.5 py-1.5 text-[12px]')}><Loader2 size={14} className="animate-spin" />{t('Đang tính…')}</div>
  const p = r.plan
  const left = p.leftover.reduce((s, x) => s + x.count, 0)
  const pal = vehicle.kind === 'pallet'
  const sum = (u: 'pallet' | 'thùng', k: 'placed' | 'total') => r.count.filter(c => c.unit === u).reduce((s, c) => s + c[k], 0) // i18n-ok — đơn vị của thuật toán
  const palPlaced = sum('pallet', 'placed'), palTotal = sum('pallet', 'total')
  const topPlaced = sum('thùng', 'placed'), topTotal = sum('thùng', 'total') // i18n-ok
  const leftWhat = pal
    ? [palTotal - palPlaced ? t('{n} pallet', { n: fmtInt(palTotal - palPlaced) }) : '', topTotal - topPlaced ? t('{n} thùng', { n: fmtInt(topTotal - topPlaced) }) : ''].filter(Boolean).join(' + ')
    : t('{n} thùng', { n: fmtInt(left) })
  const head = r.errors.length ? t('Không xếp được') : r.fits ? t('Vừa xe') : left ? t('Thiếu {what}', { what: leftWhat }) : t('Quá tải')
  const count = pal ? `${fmtInt(palPlaced)}/${fmtInt(palTotal)}` : `${fmtInt(p.placedCount)}/${fmtInt(p.totalCount)}`
  return (
    <div className="pointer-events-none min-w-0">
      <button onClick={() => setMore(v => !v)} aria-expanded={more} aria-label={t('Kết quả: {head}. Bấm để xem chi tiết', { head })}
        className={cx(frame, 'flex max-w-full items-stretch text-left transition-opacity', busy && 'opacity-80')}>
        <span className={cx('flex items-center gap-1 whitespace-nowrap px-2 py-1 text-[12px] font-semibold', r.fits ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900')}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : r.fits ? <Check size={13} /> : <AlertTriangle size={13} />}{head}
        </span>
        <Cell label={pal ? 'Pallet' : t('Thùng')} value={count} bad={pal ? palPlaced < palTotal : left > 0} className="max-sm:hidden" />
        <Cell label={t('Tải')} value={r.payloadPct != null ? `${fmtDec(r.payloadPct, 0)}%` : fmtKgShort(r.weightKg)} pct={r.payloadPct} />
        <Cell label={t('Khối')} value={`${fmtDec(p.volumePct, 0)}%`} pct={p.volumePct} />
        <Cell label={t('Sàn')} value={`${fmtDec(p.lengthUsedPct, 0)}%`} pct={p.lengthUsedPct} />
        <span className="grid place-items-center border-l border-slate-300 px-1 text-slate-500"><ChevronDown size={14} className={cx('transition-transform', more && 'rotate-180')} /></span>
      </button>
      {more && (
        <div className={cx(frame, 'mt-1 max-h-[calc(50vh-80px)] w-[272px] overflow-y-auto lg:max-h-[60vh]')}>
          <Row label={pal ? 'Pallet' : t('Thùng')} value={`${count}${pal && topTotal ? ` ${t('+{n} th', { n: fmtInt(topPlaced) })}` : ''}`} bad={pal ? palPlaced < palTotal : left > 0} />
          <Row label={t('Tải')} value={`${fmtKgShort(r.weightKg)}${vehicle.payloadKg ? ` / ${fmtKgShort(vehicle.payloadKg)}` : ''}`} pct={r.payloadPct} />
          <Row label={t('Thể tích')} value={fmtM3(r.totals.m3)} pct={p.volumePct} />
          <Row label={t('Sàn')} value={`${m((vehicle.l * p.lengthUsedPct) / 100)}/${m(vehicle.l)} m`} pct={p.lengthUsedPct} />
          {/* từng đơn trên xe: bao nhiêu thùng, đã lên xe đủ chưa */}
          <div className="border-t border-navy-950 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">{t('Theo đơn')}</div>
          {orders.map((o, i) => {
            const rows = r.count.filter(c => c.orderId === o.id)
            const sumOf = (u: 'pallet' | 'thùng', k: 'placed' | 'total') => rows.filter(c => c.unit === u).reduce((s, c) => s + c[k], 0) // i18n-ok — đơn vị của thuật toán
            const pp = sumOf('pallet', 'placed'), pt = sumOf('pallet', 'total'), cp = sumOf('thùng', 'placed'), ct = sumOf('thùng', 'total') // i18n-ok
            const short = pp < pt || cp < ct
            return (
              <div key={o.id} className="flex items-center gap-2 border-t border-slate-300 px-2 py-1">
                <span className="num grid h-[18px] min-w-[18px] place-items-center rounded-sm bg-navy-950 px-0.5 text-[11px] font-bold text-white">{i + 1}</span>
                <span className="min-w-0 flex-1 break-words text-[12px] leading-snug text-slate-800">{tx(o.name)}</span>
                <span className={cx('num shrink-0 text-right text-[12px] font-semibold', short ? 'text-red-700' : 'text-slate-900')}>
                  {!pal && short ? `${fmtInt(cp)}/` : ''}{t('{n} thùng', { n: fmtInt(o.cartons) })}
                  {pal && pt > 0 && <span className="block text-[11px] font-normal text-slate-600">{pp < pt ? `${fmtInt(pp)}/` : ''}{t('{n} pallet', { n: fmtInt(pt) })}</span>}
                </span>
              </div>
            )
          })}
          <div className="truncate border-t border-navy-950 px-2 py-1 text-[11px] text-slate-700">{tx(tripName)} · {tx(vehicle.name)}</div>
        </div>
      )}
      {sug ? (
        <button onClick={() => onPick(sug.id)} className={cx(frame, 'mt-1 flex max-w-full items-center gap-1.5 border bg-brand-50 px-2 py-1 text-left text-[12px] text-slate-800 hover:bg-brand-100')}>
          <Sparkles size={13} className="shrink-0 text-brand-600" />
          <span className="min-w-0 truncate">{r.fits ? t('Xe nhỏ hơn vẫn vừa') : t('Xe vừa nhất')}: <b>{tx(sug.name)}</b></span>
          <span className="shrink-0 font-semibold text-brand-700">{t('Dùng')}</span>
        </button>
      ) : !r.fits && noneFits ? (
        <div className={cx(frame, 'mt-1 border bg-red-50 px-2 py-1 text-[12px] text-red-900')}>{pal ? t('Không xe pallet nào chở hết, tách bớt hàng.') : t('Không xe thùng rời nào chở hết, tách bớt hàng.')}</div>
      ) : null}
    </div>
  )
}

const pctTone = (pct: number | null | undefined) => (pct == null ? '' : pct > 100 ? 'text-red-700' : pct >= 85 ? 'text-amber-800' : '')
const pctBar = (pct: number) => (pct > 100 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-500' : 'bg-brand-500')

/** Một ô của dải khung tên: nhãn nhỏ + số, thanh 2 px ở đáy ô = % đã dùng. */
function Cell({ label, value, pct, bad, className }: { label: string; value: string; pct?: number | null; bad?: boolean; className?: string }) {
  return (
    <span className={cx('relative flex items-baseline gap-1 whitespace-nowrap border-l border-slate-300 px-2 py-1', className)}>
      <span className="text-[11px] text-slate-600">{label}</span>
      <span className={cx('num text-[12px] font-semibold', bad ? 'text-red-700' : pctTone(pct))}>{value}</span>
      {pct != null && <span className={cx('absolute bottom-0 left-0 h-[2px]', pctBar(pct))} style={{ width: `${Math.min(100, pct)}%` }} />}
    </span>
  )
}

function Row({ label, value, pct, bad }: { label: string; value: string; pct?: number | null; bad?: boolean }) {
  return (
    <div className="grid grid-cols-[70px_1fr] border-t border-slate-300 first:border-t-0">
      <div className="border-r border-slate-300 px-2 py-1 text-[12px] text-slate-600">{label}</div>
      <div className="min-w-0 px-2 py-1">
        <div className="flex items-baseline justify-between gap-1.5">
          <span className={cx('num truncate text-[13px] font-semibold', bad && 'text-red-700')}>{value}</span>
          {pct != null && <span className={cx('num shrink-0 text-[12px] font-semibold text-slate-700', pctTone(pct))}>{fmtDec(pct, 0)}%</span>}
        </div>
        {pct != null && <div className="mt-0.5 h-[3px] bg-slate-200"><div className={cx('h-full', pctBar(pct))} style={{ width: `${Math.min(100, pct)}%` }} /></div>}
      </div>
    </div>
  )
}

// ── Góc nhìn: MỘT nút, bấm mở danh sách hướng nhìn + ẩn/hiện vách ─────────────
// Khung 3D toàn màn hình: phủ kín bằng CSS (iPhone không cho trang web vào toàn màn hình thật); máy có
// Fullscreen API thì xin luôn để ẩn thanh trình duyệt — thoát bằng Esc / cử chỉ của máy ⇒ khung về chỗ cũ.
function useToggleFull(): [boolean, (on: boolean) => void] {
  const [full, setFull] = useState(false)
  const set = (on: boolean) => {
    setFull(on)
    if (on) document.documentElement.requestFullscreen?.()?.catch(() => {})
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }
  useEffect(() => {
    if (!full) return
    const html = document.documentElement, overflow = html.style.overflow
    html.style.overflow = 'hidden'   // trang phía sau không cuộn theo ngón tay
    const onFs = () => { if (!document.fullscreenElement) setFull(false) }
    // Esc: trình duyệt thường tự thoát toàn màn hình thật (⇒ onFs); còn lại thì tự thoát — trừ khi đang mở bảng / hộp hỏi /
    // menu nhỏ (Esc đầu chỉ đóng menu Góc nhìn, Esc sau mới thoát toàn màn hình)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role=dialog],[role=alertdialog],[data-popover]')) setFull(false) }
    document.addEventListener('fullscreenchange', onFs)
    window.addEventListener('keydown', onKey)
    return () => {
      html.style.overflow = overflow
      document.removeEventListener('fullscreenchange', onFs)
      window.removeEventListener('keydown', onKey)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [full])
  return [full, set]
}

function ViewMenu({ view, walls, onView, onWalls }: { view: ViewPreset; walls: 'open' | 'glass'; onView: (p: ViewPreset) => void; onWalls: () => void }) {
  const cur = t(VIEWS.find(([p]) => p === view)?.[1] ?? VIEWS[0][1])
  return (
    <Popover align="right" className="pointer-events-auto shrink-0" panelClass="w-[210px] overflow-hidden py-1"
      trigger={({ open, toggle }) => (
        <button onClick={toggle} aria-expanded={open} aria-label={t('Góc nhìn: {view}', { view: cur })} title={t('Góc nhìn')}
          className="hit flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-[12px] font-semibold text-slate-800 hover:bg-slate-50">
          <Rotate3d size={16} /><span className="hidden sm:inline">{cur}</span><ChevronDown size={14} className="text-slate-500" />
        </button>
      )}>
      {close => (
        <>
          {VIEWS.map(([p, label]) => (
            <MenuItem key={p} onClick={() => { onView(p); close() }} icon={view === p ? <Check size={15} className="text-brand-600" /> : <span className="inline-block w-[15px]" />}>{t(label)}</MenuItem>
          ))}
          <div className="my-1 border-t border-slate-200" />
          <MenuItem onClick={() => { onWalls(); close() }} icon={walls === 'open' ? <Eye size={15} /> : <EyeOff size={15} />}>
            {walls === 'open' ? t('Hiện vách thùng') : t('Ẩn vách thùng')}
          </MenuItem>
        </>
      )}
    </Popover>
  )
}

// ── Bảng Thùng xe: chỉnh xe đang dùng + đổi xe khác (tìm, ô chọn, thử ✓/✗ từng xe, sửa) ───────
function SpecPopup({ vehicle, vehicles, suggestion, fits, sharedWith, more, onMore, onClose, onPick, onPatch, onEdit, onAdd }: {
  vehicle?: Vehicle; vehicles: Vehicle[]; suggestion: string | null; fits: Record<string, FitCheck> | null; sharedWith: number
  more: boolean; onMore: (v: boolean) => void
  onClose: () => void; onPick: (id: string) => void; onPatch: (p: Partial<Vehicle>) => void; onEdit: (v: Vehicle) => void; onAdd: () => void
}) {
  const pallet = useData(s => s.pallet)
  const box = useViewportBox(true)
  const { kb } = useVisualView()
  const [q, setQ] = useState('')
  const [onlyFit, setOnlyFit] = useState(false)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[data-sheet]')) onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const isAdmin = useAuth(s => s.isAdmin)
  const needle = q.trim().toLowerCase()
  const list = vehicles.filter(v => (!needle || v.name.toLowerCase().includes(needle) || tx(v.name).toLowerCase().includes(needle) || v.plate.toLowerCase().includes(needle))
    && (!onlyFit || fits?.[v.id] === 'fit'))
  const mine = list.filter(v => v.owner === 'me'), admin = list.filter(v => v.owner === 'admin')
  const FIT: Record<FitCheck, ReactNode> = {
    fit: <Badge tone="green"><Check size={11} />{t('Chở hết')}</Badge>,
    space: <Badge tone="red"><X size={11} />{t('Thiếu chỗ')}</Badge>,
    weight: <Badge tone="red"><X size={11} />{t('Quá tải')}</Badge>,
  }
  const row = (v: Vehicle) => {
    const on = v.id === vehicle?.id
    return (
      <div key={v.id} className={cx('flex items-center', on && 'bg-brand-50')}>
        <button onClick={() => onPick(v.id)} aria-pressed={on} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-3 pr-1 text-left hover:bg-black/[.03]">
          <span className={cx('grid h-[18px] w-[18px] shrink-0 place-items-center rounded border-2', on ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-400 bg-white')}>
            {on && <Check size={12} strokeWidth={3} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="min-w-0 break-words text-sm font-semibold leading-snug text-slate-900">{tx(v.name)}</span>
              {v.id === suggestion && <Badge tone="blue"><Sparkles size={11} />{t('Vừa nhất')}</Badge>}
            </span>
            <span className="num block text-[12px] leading-snug text-slate-600"><span className="whitespace-nowrap">{m(v.l)} × {m(v.w)} × {m(v.h)} m</span>{v.payloadKg != null && <> · <span className="whitespace-nowrap">{fmtKgShort(v.payloadKg)}</span></>} · {v.kind === 'pallet' ? 'pallet' : t('thùng rời')}</span>
          </span>
          <span className="shrink-0">{fits ? (fits[v.id] ? FIT[fits[v.id]] : null) : <Loader2 size={14} className="animate-spin text-slate-400" />}</span>
        </button>
        <IconButton label={t('Sửa {name}', { name: tx(v.name) })} onClick={() => onEdit(v)} className="mr-1 text-slate-500"><Pencil size={15} /></IconButton>
      </div>
    )
  }
  return (
    // điện thoại: khung bám phần màn còn thấy — bàn phím mở (ô lòng thùng, ô tìm xe) thì bảng nằm ngay trên bàn phím,
    // không chìm dưới nó; máy tính: khung không có hộp (contents), bảng đặt góc phải khung 3D như cũ
    <div className="pointer-events-none fixed inset-0 z-40 lg:contents" style={box}>
    <div role="dialog" aria-label={t('Thùng xe')}
      className={cx('pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl border-t border-slate-300 bg-white shadow-pop lg:inset-x-auto lg:bottom-auto lg:right-3 lg:top-14 lg:max-h-[calc(100%-68px)] lg:w-[400px] lg:rounded-lg lg:border',
        kb ? 'max-h-[92%]' : 'pb-safe max-h-[56%]')}
      style={{ animation: 'sheet-up .18s ease-out' }}>
      <KeyboardShield className="bg-white" />
      <div className="flex items-center gap-2 border-b border-slate-200 py-1 pl-4 pr-1">
        <h2 className="flex-1 text-base font-semibold text-slate-900">{t('Thùng xe')}</h2>
        <IconButton label={t('Đóng')} onClick={onClose}><X size={19} /></IconButton>
      </div>
      <div data-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {vehicle && (
          <div className="space-y-2.5 px-3 py-3">
            {/* XE: lòng thùng + tải — của riêng xe này. Gấp thành một dòng tóm tắt, bấm mới mở ô sửa (cùng kiểu Block) */}
            <div className="rounded-lg border border-slate-300">
              <button type="button" onClick={() => onMore(!more)} aria-expanded={more} title={t('Chỉnh thông số thùng xe')}
                className={cx('flex w-full items-center gap-2 rounded-t-lg px-3 py-2 text-left hover:bg-slate-50', more ? 'border-b border-slate-200' : 'rounded-b-lg')}>
                <TruckGlyph pallet={vehicle.kind === 'pallet'} small />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="min-w-0 break-words text-sm font-semibold leading-snug text-slate-900">{tx(vehicle.name)}</span>
                    <OwnerTag v={vehicle} />
                  </span>
                  <span className="num block text-[12px] leading-snug text-slate-600">
                    <span className="whitespace-nowrap">{m(vehicle.l)} × {m(vehicle.w)} × {m(vehicle.h)} m</span>
                    {vehicle.payloadKg != null && <> · <span className="whitespace-nowrap">{fmtKgShort(vehicle.payloadKg)}</span></>}
                    {' · '}{vehicle.kind === 'pallet' ? <span className="whitespace-nowrap">pallet {m(pallet.l)} × {m(pallet.w)} m</span> : t('thùng rời')}
                  </span>
                </span>
                <ChevronDown size={18} className={cx('shrink-0 text-slate-500 transition-transform', more && 'rotate-180')} />
              </button>
              {more && <div className="space-y-2.5 p-3">
                <Segmented value={vehicle.kind} onChange={k => onPatch({ kind: k })} options={[
                  { value: 'loose', label: t('Thùng rời (xe xá)') }, { value: 'pallet', label: t('Xếp pallet') },
                ]} />
                <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700"><Ruler size={14} />{t('Lòng thùng xe (đo bên trong)')}</div>
                <div className="grid grid-cols-3 gap-2">
                  <LiveNum label={t('Dài lòng thùng')} value={vehicle.l} valid={OK_L} suffix="mm" onCommit={v => v && onPatch({ l: v })} />
                  <LiveNum label={t('Rộng')} value={vehicle.w} valid={OK_W} suffix="mm" onCommit={v => v && onPatch({ w: v })} />
                  <LiveNum label={t('Cao')} value={vehicle.h} valid={OK_H} suffix="mm" onCommit={v => v && onPatch({ h: v })} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <LiveNum label={t('Tải trọng')} value={vehicle.payloadKg} valid={n => n >= 100} suffix="kg" onCommit={v => onPatch({ payloadKg: v })} />
                </div>
                <p className="text-[12px] text-slate-600">
                  {vehicle.owner === 'admin' ? t('Xe mẫu: sửa số nào app tự tạo xe của bạn, xe mẫu giữ nguyên.')
                    : sharedWith ? t('Xe này đang dùng ở {n} chuyến khác, sửa ở đây là sửa cho cả các chuyến đó.', { n: sharedWith })
                    : t('Sửa xong sơ đồ tự vẽ lại.')}
                </p>
              </div>}
            </div>
            {/* PALLET: một cỡ dùng chung cho MỌI xe pallet — tách khung riêng để không lẫn với kích thước xe */}
            {more && vehicle.kind === 'pallet' && (
              <div className="rounded-lg border border-slate-300 bg-slate-50">
                <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
                  <Layers size={16} className="text-slate-600" />
                  <span className="flex-1 text-sm font-semibold text-slate-900">Pallet</span>
                  <span className="text-[12px] text-slate-600">{t('dùng cho mọi xe pallet')}</span>
                </div>
                <div className="p-3"><PalletFields cols="grid-cols-3" /></div>
              </div>
            )}
          </div>
        )}
        <SectionBand title={t('Đổi xe khác')} meta={t('· thử hàng chuyến này trên từng xe')} />
        <div className="flex items-center gap-2 px-3 py-2">
          <SearchInput className="min-w-0 flex-1" placeholder={t('Tên xe, biển số')} value={q} onChange={e => setQ(e.target.value)} aria-label={t('Tìm xe')} />
          <label className="tap flex shrink-0 cursor-pointer items-center gap-1.5 text-[13px] text-slate-700">
            <input type="checkbox" checked={onlyFit} onChange={e => setOnlyFit(e.target.checked)} className="h-4 w-4 accent-brand-500" />{t('Chỉ xe chở hết')}
          </label>
        </div>
        <div className="space-y-2.5 px-3 pb-1">
          {/* Xe của tôi: khung viền xanh, nền trắng · Mẫu chung: khung nét đứt, nền xám — nhìn là phân biệt */}
          <div className="overflow-hidden rounded-lg border-[1.5px] border-brand-500 bg-white">
            <div className="flex items-center gap-2 bg-brand-500 px-3 py-1.5 text-[12px] font-semibold text-white">
              <UserRound size={14} /><span className="flex-1">{t('Xe của tôi')}</span><span className="num">{mine.length}</span>
            </div>
            {mine.length ? <div className="divide-y divide-slate-100">{mine.map(row)}</div>
              : <p className="px-3 py-2.5 text-[13px] text-slate-600">{needle || onlyFit ? t('Không có xe nào khớp.') : t('Chưa có. Sửa một xe mẫu hoặc thêm xe mới, xe sẽ nằm ở đây.')}</p>}
            <button onClick={onAdd} className="tap flex w-full items-center gap-2 border-t border-slate-200 px-3 text-[13px] font-semibold text-brand-700 hover:bg-brand-50">
              <Plus size={16} />{t('Thêm xe của tôi')}
            </button>
          </div>
          <div className="overflow-hidden rounded-lg border-[1.5px] border-dashed border-slate-400 bg-slate-50">
            <div className="flex items-center gap-2 border-b border-dashed border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-slate-700">
              <Users size={14} /><span className="flex-1">{t('Mẫu chung')} <span className="font-normal text-slate-600">· {isAdmin ? t('bạn là admin, sửa được mẫu') : t('sửa sẽ thành xe của bạn')}</span></span><span className="num">{admin.length}</span>
            </div>
            {admin.length ? <div className="divide-y divide-slate-200/70">{admin.map(row)}</div>
              : <p className="px-3 py-2.5 text-[13px] text-slate-600">{t('Không có xe nào khớp.')}</p>}
          </div>
        </div>
        <div className="h-3" />
      </div>
    </div>
    </div>
  )
}

// ── Một đơn = một THẺ riêng trên cột khai hàng: số thứ tự giao, tên, điểm giao, nút gỡ ngoài cùng,
//    dải số (thùng · khối lượng · thể tích) dạng ô như bảng, không viết thành câu. Bấm tên / dải số = chỉ
//    hàng của đơn trên xe; sửa tên, điểm giao bằng nút "Sửa" (popup) — user 28/10: "bấm vào đơn thì hiện ra
//    hàng của đơn đang ở đâu, muốn sửa thì bấm nút sửa" (trước tên đơn là ô nhập, bấm vào là thành sửa chữ) ─────
function OrderBlock({ o, i, count, tot, selected, onSelect, onEdit, onMove, onOpenPage, onRemove, onAddItem, children }: {
  o: Order; i: number; count: number; tot: ReturnType<typeof orderTotals>; selected: boolean; onSelect: () => void
  onEdit: () => void; onMove: (d: -1 | 1) => void; onOpenPage: () => void; onRemove: () => void; onAddItem: () => void; children: ReactNode
}) {
  const where = count > 1 ? (i === 0 ? t('Sát cửa') : i === count - 1 ? t('Sâu trong') : t('Giữa thùng')) : null
  const [open, setOpen] = useState(true)
  const name = tx(o.name)
  return (
    <div className={cx('overflow-hidden rounded-lg border bg-white', selected ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-300')}>
      <div className={cx('flex items-start gap-2 border-b border-slate-200 py-1.5 pl-3 pr-1', selected ? 'bg-brand-50' : 'bg-slate-50')}>
        <span className="num mt-1 grid h-7 min-w-[28px] shrink-0 place-items-center rounded bg-navy-950 px-1 text-[13px] font-bold text-white" title={t('Giao thứ {n}', { n: i + 1 })}>{i + 1}</span>
        <button type="button" onClick={onSelect} aria-pressed={selected} title={t('Xem hàng của đơn này nằm đâu trên xe')}
          className="min-h-[44px] min-w-0 flex-1 rounded-md px-1 py-0.5 text-left [@media(hover:hover)]:hover:bg-white">
          <span className="block break-words text-[15px] font-semibold leading-snug text-slate-900">{name || t('Đơn chưa đặt tên')}</span>
          {o.place && (
            <span className="flex items-start gap-1 text-[13px] leading-snug text-slate-600">
              <MapPin size={13} className="mt-[3px] shrink-0 text-slate-500" /><span className="min-w-0 break-words">{tx(o.place)}</span>
            </span>
          )}
        </button>
        <button type="button" aria-label={t('Sửa đơn {name}', { name })} aria-haspopup="dialog" onClick={onEdit}
          className="tap inline-flex shrink-0 items-center gap-1 rounded-md px-2 text-[13px] font-semibold text-slate-600 hover:bg-white">
          <Pencil size={14} />{t('Sửa')}
        </button>
        <IconButton label={t('Gỡ {name} khỏi chuyến', { name })} title={t('Gỡ đơn khỏi chuyến')} onClick={onRemove} className="text-slate-500 hover:bg-red-50 hover:text-red-700"><Trash2 size={17} /></IconButton>
        <Popover align="right" panelClass="w-[220px] overflow-hidden py-1"
          trigger={({ toggle }) => <IconButton label={t('Tuỳ chọn {name}', { name })} onClick={toggle}><MoreVertical size={17} /></IconButton>}>
          {close => (
            <>
              {count > 1 && <>
                <MenuItem icon={<ArrowUp size={15} />} disabled={i === 0} onClick={() => { onMove(-1); close() }}>{t('Giao sớm hơn')}</MenuItem>
                <MenuItem icon={<ArrowDown size={15} />} disabled={i === count - 1} onClick={() => { onMove(1); close() }}>{t('Giao muộn hơn')}</MenuItem>
              </>}
              <MenuItem icon={<ExternalLink size={15} />} onClick={() => { close(); onOpenPage() }}>{t('Mở trang đơn')}</MenuItem>
            </>
          )}
        </Popover>
      </div>
      {/* dải số = bấm để chỉ hàng của đơn trên xe; mũi tên bên phải = thu gọn / mở rộng (mặc định mở) */}
      <div className={cx('flex items-stretch', open && 'border-b border-slate-200')}>
        <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={t('Xem {name} nằm đâu trên xe', { name })} title={t('Xem đơn này nằm đâu trên xe')}
          className={cx('grid min-w-0 flex-1 divide-x divide-slate-200 text-left transition-colors', where ? 'grid-cols-[0.8fr_1fr_1fr_1.15fr]' : 'grid-cols-3',
            selected ? 'bg-brand-50' : 'hover:bg-slate-50')}>
          <Stat label={t('Thùng')} value={fmtInt(tot.cartons)} />
          <Stat label={t('Nặng')} value={fmtKgShort(tot.kg)} />
          <Stat label={t('Khối')} value={fmtM3(tot.m3)} />
          {where && <Stat label={t('Giao thứ {n}', { n: i + 1 })} value={where} />}
        </button>
        <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-label={open ? t('Thu gọn {name}', { name }) : t('Mở rộng {name}', { name })}
          className="grid w-11 shrink-0 place-items-center border-l border-slate-200 text-slate-600 transition-colors hover:bg-slate-50">
          <ChevronDown size={18} className={cx('transition-transform', open && 'rotate-180')} />
        </button>
      </div>
      {open && <>
        {children}
        <button onClick={onAddItem} className="tap flex w-full items-center gap-2 border-t border-slate-100 px-4 text-[13px] font-semibold text-brand-700 hover:bg-brand-50">
          <Plus size={16} />{count > 1 ? t('Thêm hàng vào {name}', { name }) : t('Thêm hàng')}
        </button>
      </>}
    </div>
  )
}

const SumChip = ({ label, value }: { label: string; value: string }) => (
  <span className="whitespace-nowrap"><span className="text-[12px] text-slate-500">{label} </span><span className="font-semibold text-slate-800">{value}</span></span>
)

const Stat = ({ label, value }: { label: string; value: string }) => (
  <span className="block min-w-0 px-2.5 py-1.5">
    <span className="block break-words text-[11px] leading-tight text-slate-600">{label}</span>
    <span className="num block break-words text-[13px] font-semibold leading-snug text-slate-900">{value}</span>
  </span>
)

const OwnerTag = ({ v }: { v: { owner: 'admin' | 'me' } }) => v.owner === 'me'
  ? <Badge tone="blue"><UserRound size={11} />{t('Của tôi')}</Badge>
  : <Badge><Users size={11} />{t('Mẫu chung')}</Badge>

// ── Một khối trên cột khai hàng: tên + tóm tắt; bấm để thu / mở ─────────────
function Block({ title, summary, open, onToggle, children }: { title: string; summary: ReactNode; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="mt-3 border-y border-slate-200 bg-white sm:mx-3 sm:rounded-lg sm:border">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 sm:rounded-t-lg">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-slate-900">{title}</span>
          <span className="num block text-[13px] text-slate-600">{summary}</span>
        </span>
        <ChevronDown size={18} className={cx('shrink-0 text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-slate-200">{children}</div>}
    </section>
  )
}

// ── Sửa nhanh một mã hàng ngay trong dòng ───────────────────────────────────
// Quy cách trên dòng hàng (user 28/10: "thay vì 420 × 255 × 130 mm thì để 110 thùng – 11 lớp – 10,05 kg"):
// số thủ kho đối chiếu khi xếp; cỡ thùng xem ở phần Sửa. Chưa khai thùng/pallet lẫn số lớp thì mới hiện cỡ thùng.
function specParts(it: Item): string[] {
  const pack = [it.perPallet ? t('{n} thùng/pallet', { n: fmtInt(it.perPallet) }) : null, it.maxLayers ? t('{n} lớp', { n: fmtInt(it.maxLayers) }) : null]
    .filter((s): s is string => !!s)
  return [...(pack.length ? pack : [`${fmtDims(it.l, it.w, it.h)} mm`]), ...(it.kg != null ? [`${fmtDec(it.kg, 2)} kg`] : [])]
}

// ── Bảng đếm chân — cái thủ kho cầm khi xếp, bên nhận dùng đối chiếu ────────────
function CountSheet({ r, colors, focus, onFocus, tripName, vehicle, onToast }: {
  r: TripResult | null; colors: Map<string, string>; focus: Set<number> | null; onFocus: (gi: number) => void
  tripName: string; vehicle?: Vehicle; onToast: (s: string) => void
}) {
  if (!r || !vehicle) return <p className="px-4 py-5 text-sm text-slate-600">{t('Thêm hàng để có bảng đếm chân.')}</p>
  const stackText = (c: TripResult['count'][number]) => c.unit === 'pallet'
    ? t('{n} pallet', { n: c.placed })
    : c.stacks.map(([n, l]) => t('{n} chân × {l} lớp', { n, l })).join(' + ')
  // ruột pallet gộp: "gồm 40 thùng Sữa 180ml x48 · 40 thùng Thạch túi 110ml x24"
  const mixText = (c: TripResult['count'][number]) => c.mix?.map(x => t('{n} thùng {name}', { n: fmtInt(x.n), name: tx(x.label) })).join(' · ')
  const copy = async () => {
    const box = t('lòng thùng {dims} mm', { dims: fmtDims(vehicle.l, vehicle.w, vehicle.h) })
    const onTop = ' ' + t('(trên nóc hàng khác)')
    const lines = [
      `${tx(tripName)} — ${tx(vehicle.name)}${vehicle.plate ? ` (${vehicle.plate})` : ''}, ${box}`,
      t('Thứ tự xếp (từ trong cabin ra cửa):'),
      ...r.count.map((c, i) => {
        const mix = c.mix ? ' — ' + t('mỗi pallet gồm {list}', { list: mixText(c) ?? '' }) : ''
        // số theo ngôn ngữ, số ít / nhiều đúng ("1 pallet", "935/1.250 thùng"); pallet đủ thì không nhắc lại số
        const n = c.placed < c.total ? `${fmtInt(c.placed)}/${fmtInt(c.total)}` : fmtInt(c.placed)
        const pal = c.placed < c.total ? t('{n} pallet', { n }) : ''
        const sum = c.unit === 'pallet' ? pal : t('{n} thùng', { n })
        return `${i + 1}. ${tx(c.label)} [${tx(c.orderName)}]: ${stackText(c)}${sum ? ' = ' + sum : ''}${c.onTopOfOthers ? onTop : ''}${mix}`
      }),
      t('Tổng: {placed}/{total} · {kg} · thể tích {pct}%', {
        placed: fmtInt(r.plan.placedCount), total: fmtInt(r.plan.totalCount), kg: fmtKgShort(r.weightKg), pct: fmtDec(r.plan.volumePct, 0),
      }),
    ]
    try { await navigator.clipboard.writeText(lines.join('\n')); onToast(t('Đã chép bảng đếm chân')) }
    catch { onToast(t('Trình duyệt chặn chép, hãy chụp màn hình')) }
  }
  const snap = async () => {
    const c = document.querySelector<HTMLCanvasElement>('[data-scene] canvas')
    if (!c) return
    const png = c.toDataURL('image/png')   // chụp ngay lúc bấm, trước khi hộp "Lưu thành…" mở
    const name = t('so-do-{name}.png', { name: tx(tripName).replace(/\s+/g, '-').toLowerCase() })
    if (await saveFile(name, () => fetch(png).then(r => r.blob()))) onToast(t('Đã lưu ảnh sơ đồ'))
  }
  return (
    <section className="pt-3">
      <div className="flex gap-2 px-4">
        <Button className="flex-1" onClick={copy}><ClipboardCopy size={17} />{t('Chép để gửi Zalo')}</Button>
        <Button className="flex-1" onClick={snap}><Camera size={17} />{t('Lưu ảnh 3D')}</Button>
      </div>
      <SectionBand title={t('Thứ tự xếp')} meta={t('· bấm một dòng để soi khối đó')} className="mt-3" />
      <div className="divide-y divide-slate-100">
        {r.count.map((c, i) => {
          const on = focus?.has(c.group)
          const short = c.placed < c.total
          return (
            <button key={c.group} onClick={() => onFocus(c.group)} aria-pressed={!!on}
              className={cx('grid w-full grid-cols-[20px_16px_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-2.5 text-left transition-colors', on ? 'bg-brand-50' : 'hover:bg-slate-50')}>
              <span className="num mt-0.5 text-right text-[13px] font-semibold text-slate-600">{i + 1}</span>
              <span className="mt-1 h-4 w-4 rounded-sm border border-black/20" style={{ background: groupColor(r.meta[c.group], colors) }} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-snug text-slate-900">{tx(c.label)}</span>
                <span className="block text-[13px] text-slate-600">{tx(c.orderName)}{c.onTopOfOthers && <Badge tone="amber" className="ml-1.5">{t('trên nóc')}</Badge>}</span>
                <span className="num mt-0.5 block text-[13px] font-medium text-slate-800">{stackText(c) || '—'}</span>
                {c.mix && <span className="num mt-0.5 block break-words text-[12px] leading-snug text-slate-600">{t('Gồm {list}', { list: mixText(c) ?? '' })}</span>}
              </span>
              <span className={cx('num text-right text-sm font-semibold', short ? 'text-red-700' : 'text-slate-900')}>
                {fmtInt(c.placed)}{short && <span className="text-[13px]">/{fmtInt(c.total)}</span>}
                <span className="block text-[12px] font-normal text-slate-600">{tx(c.unit)}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ── Sửa đơn (popup từ nút "Sửa" trên thẻ đơn): tên, điểm giao VÀ hàng trong đơn — thêm / bỏ mã, số thùng (chủ dự án
// 29/10: "edit order phải sửa được cả mã hàng"). Sửa trên bản nháp, bấm Lưu mới ghi (đơn mẫu ⇒ tách chuyến như mọi lần sửa).
function OrderSheet({ order, items, colorOf, onClose, onSave }: {
  order: Order | null; items: Item[]; colorOf: (id: string) => string | undefined
  onClose: () => void; onSave: (o: Order, p: Partial<Order>) => void
}) {
  const [name, setName] = useState('')
  const [place, setPlace] = useState('')
  const [lines, setLines] = useState<Order['lines']>([])
  const [picking, setPicking] = useState(false)
  const [tried, setTried] = useState(false)
  // nạp bản nháp khi MỞ đơn (theo id) — cập nhật kho lúc đang sửa không xoá chữ đang gõ
  useEffect(() => { setPicking(false); if (order) { setName(order.name); setPlace(order.place); setLines(order.lines); setTried(false) } }, [order?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const byId = new Map(items.map(i => [i.id, i]))
  const qty = (itemId: string, q: number) => setLines(ls => ls.map(l => (l.itemId === itemId ? { ...l, qty: Math.max(0, Math.round(q)) } : l)))
  const drop = (itemId: string) => setLines(ls => ls.filter(l => l.itemId !== itemId))
  const save = () => {
    setTried(true)
    if (!order || !name.trim()) return
    onSave(order, { name: name.trim(), place: place.trim(), lines }); onClose()
  }
  return (<>
    <Sheet open={!!order && !picking} onClose={onClose} title={t('Sửa đơn')} subtitle={t('Tên, điểm giao và hàng trong đơn')}
      footer={<div className="flex gap-2">
        <Button className="flex-1" onClick={onClose}>{t('Huỷ')}</Button>
        <Button variant="primary" className="flex-[2]" onClick={save}>{t('Lưu')}</Button>
      </div>}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); save() }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Tên đơn')} error={tried && !name.trim() ? t('Nhập tên đơn') : null}>
            <TextInput value={name} onChange={e => setName(e.target.value)} />
          </Field>
          <Field label={t('Điểm giao')} hint={t('Không bắt buộc')}>
            <TextInput value={place} onChange={e => setPlace(e.target.value)} placeholder={t('Cửa hàng / khách')} />
          </Field>
        </div>
        <button type="submit" hidden />
      </form>
      <div className="mt-5 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{t('Hàng trong đơn')} <span className="font-normal text-slate-600">{t('· {n} mã', { n: lines.length })}</span></h3>
        <Button variant="ghost" className="text-brand-700" onClick={() => setPicking(true)}><Plus size={17} />{t('Thêm mã')}</Button>
      </div>
      {!lines.length && <p className="py-4 text-center text-sm text-slate-600">{t('Chọn các mã hàng rồi nhập số thùng.')}</p>}
      <div className="-mx-5">
        {lines.map(l => {
          const it = byId.get(l.itemId)
          return (
            <div key={l.itemId} className="border-t border-slate-100 py-1.5 pl-5 pr-3">
              {/* tên trọn dòng trên (xuống dòng được), dòng dưới: số thùng — như dòng hàng trên bàn xếp xe */}
              <div className="flex items-start gap-2">
                {it ? <BoxGlyph w={it.w} h={it.h} light={it.light} color={colorOf(it.id)} /> : <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-700" />}
                <span className="min-w-0 flex-1 pt-0.5">
                  <span className={cx('block break-words text-sm font-semibold leading-snug', it ? 'text-slate-900' : 'text-red-700')}>{it ? tx(it.name) : t('Mã hàng này đã bị xoá')}</span>
                  {it && <span className="num block text-[12px] text-slate-600">{it.code} · <span className="whitespace-nowrap">{fmtDims(it.l, it.w, it.h)} mm</span></span>}
                </span>
                <IconButton label={t('Bỏ {name} khỏi đơn', { name: it ? tx(it.name) : l.itemId })} onClick={() => drop(l.itemId)} className="shrink-0 text-slate-500"><X size={17} /></IconButton>
              </div>
              {it && (
                <div className="flex items-center justify-end">
                  <IconButton label={t('Bớt 1')} onClick={() => qty(l.itemId, l.qty - 1)} disabled={l.qty <= 0}><Minus size={15} /></IconButton>
                  <input inputMode="numeric" value={l.qty || ''} placeholder={t('Số thùng')} aria-label={t('Số thùng {name}', { name: tx(it.name) })}
                    onChange={e => qty(l.itemId, Number(e.target.value.replace(/\D/g, '')) || 0)}
                    className={cx('tap num w-[76px] rounded-md border px-1.5 text-center text-base font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:text-sm',
                      l.qty > 0 ? 'border-slate-300 bg-white' : 'border-amber-400 bg-amber-50 placeholder:text-[12px] placeholder:font-normal placeholder:text-amber-800')} />
                  <IconButton label={t('Thêm 1')} onClick={() => qty(l.itemId, l.qty + 1)}><Plus size={15} /></IconButton>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Sheet>
    {/* chọn mã: tấm sửa đơn tạm cất (bản nháp vẫn giữ), chọn xong quay lại */}
    {!!order && picking && (
      <ItemPicker open onClose={() => setPicking(false)} picked={new Set(lines.map(l => l.itemId))}
        onToggle={it => setLines(ls => (ls.some(l => l.itemId === it.id) ? ls.filter(l => l.itemId !== it.id) : [...ls, { itemId: it.id, qty: 0 }]))} />
    )}
  </>
  )
}

// ── Thêm đơn có sẵn vào chuyến, hoặc tạo đơn mới ngay trên bàn ──────────────
function OrderPicker({ open, onClose, inTrip, onAdd, onNew }: { open: boolean; onClose: () => void; inTrip: string[]; onAdd: (ids: string[]) => void; onNew: () => void }) {
  const orders = useData(s => s.orders)
  const items = useAllItems()
  const pallet = useData(s => s.pallet)
  const [sel, setSel] = useState<string[]>([])
  const wasOpen = useRef(false)
  useEffect(() => { if (open && !wasOpen.current) setSel([]); wasOpen.current = open }, [open])
  const avail = orders.filter(o => !inTrip.includes(o.id))
  return (
    <Sheet open={open} onClose={onClose} title={t('Thêm đơn / điểm giao')} subtitle={t('Đơn giao trước được xếp sát cửa')}
      footer={<div className="flex gap-2">
        <Button className="flex-1" onClick={onNew}><Plus size={17} />{t('Đơn mới')}</Button>
        <Button variant="primary" className="flex-[2]" disabled={!sel.length} onClick={() => { onAdd(sel); onClose() }}>{t('Thêm {n} đơn', { n: sel.length || '' })}</Button>
      </div>}>
      {!avail.length ? <p className="py-8 text-center text-sm text-slate-600">{t('Mọi đơn đã nằm trong chuyến này. Bấm “Đơn mới” để tạo.')}</p> : (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {avail.map(o => {
            const tot = orderTotals(resolveOrder(o, items).lines, pallet)
            const on = sel.includes(o.id)
            return (
              <button key={o.id} onClick={() => setSel(s => (on ? s.filter(x => x !== o.id) : [...s, o.id]))} aria-pressed={on}
                className={cx('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors', on ? 'bg-brand-50' : 'hover:bg-slate-50')}>
                <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded border-2', on ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-400')}>{on && <Check size={13} strokeWidth={3} />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[15px] font-semibold leading-snug text-slate-900 sm:text-sm">{tx(o.name)}{o.place && <span className="font-normal text-slate-600"> · {tx(o.place)}</span>}</span>
                  <span className="num block text-[13px] text-slate-600">{t('{n} thùng', { n: fmtInt(tot.cartons) })} · {fmtKgShort(tot.kg)} · {fmtM3(tot.m3)}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </Sheet>
  )
}
