// Danh mục MẪU CHUNG — bản MẶC ĐỊNH. Khi đã nối máy chủ, mẫu chung thật nằm ở bảng `catalog` (admin sửa
// trên giao diện, xem cloud.ts); bản này chỉ dùng khi chưa nối máy chủ / mất mạng lần đầu, và là dữ liệu
// nạp ban đầu trong supabase/schema.sql (giữ hai nơi khớp nhau).
import type { Item, Order, PalletSettings, Trip, Vehicle } from './types'

const T0 = 0

// Lòng thùng xe tải thùng kín phổ biến ở Việt Nam — số THAM KHẢO, mỗi nhà đóng thùng một khác,
// người dùng nên đo lại xe của mình.
export const ADMIN_VEHICLES: Vehicle[] = [
  { id: 'adm-v-1t5', owner: 'admin', name: 'Xe tải 1,5 tấn', plate: '', kind: 'loose', l: 3100, w: 1600, h: 1700, payloadKg: 1500, updatedAt: T0 },
  { id: 'adm-v-2t5', owner: 'admin', name: 'Xe tải 2,5 tấn', plate: '', kind: 'loose', l: 3500, w: 1750, h: 1850, payloadKg: 2500, updatedAt: T0 },
  { id: 'adm-v-3t5', owner: 'admin', name: 'Xe tải 3,5 tấn', plate: '', kind: 'loose', l: 4300, w: 1900, h: 1900, payloadKg: 3500, updatedAt: T0 },
  { id: 'adm-v-5t', owner: 'admin', name: 'Xe tải 5 tấn', plate: '', kind: 'loose', l: 5700, w: 2000, h: 2000, payloadKg: 5000, updatedAt: T0 },
  { id: 'adm-v-8t', owner: 'admin', name: 'Xe tải 8 tấn', plate: '', kind: 'loose', l: 7400, w: 2350, h: 2150, payloadKg: 8000, updatedAt: T0 },
  { id: 'adm-v-15t', owner: 'admin', name: 'Xe tải 15 tấn', plate: '', kind: 'loose', l: 9200, w: 2350, h: 2400, payloadKg: 15000, updatedAt: T0 },
  { id: 'adm-v-p8t', owner: 'admin', name: 'Xe pallet 8 tấn', plate: '', kind: 'pallet', l: 7400, w: 2350, h: 2300, payloadKg: 8000, updatedAt: T0 },
  { id: 'adm-v-p15t', owner: 'admin', name: 'Xe pallet 15 tấn', plate: '', kind: 'pallet', l: 9600, w: 2500, h: 2600, payloadKg: 15000, updatedAt: T0 },
]

// Vài cỡ thùng hay gặp — chỉ để người mới bấm thử; số liệu là ước lượng.
export const ADMIN_ITEMS: Item[] = [
  // Thùng/pallet chọn để pallet đầy cao ~1,4–1,7 m trên chân 1200×1000
  { id: 'adm-i-lon', owner: 'admin', code: 'MAU-LON24', name: 'Nước giải khát 24 lon 330ml', l: 400, w: 270, h: 125, kg: 8.5, perPallet: 90, maxLayers: null, light: false, updatedAt: T0 },
  { id: 'adm-i-chai', owner: 'admin', code: 'MAU-CHAI24', name: 'Nước suối 24 chai 500ml', l: 400, w: 270, h: 215, kg: 12.5, perPallet: 63, maxLayers: null, light: false, updatedAt: T0 },
  { id: 'adm-i-dau', owner: 'admin', code: 'MAU-DAU12', name: 'Dầu ăn 12 chai 1L', l: 330, w: 250, h: 300, kg: 11.5, perPallet: 60, maxLayers: 6, light: false, updatedAt: T0 },
  { id: 'adm-i-mi', owner: 'admin', code: 'MAU-MI30', name: 'Mì gói thùng 30 gói', l: 440, w: 320, h: 190, kg: 2.6, perPallet: 48, maxLayers: null, light: false, updatedAt: T0 },
  { id: 'adm-i-giay', owner: 'admin', code: 'MAU-A4', name: 'Giấy A4 thùng 5 ram', l: 300, w: 220, h: 225, kg: 12.5, perPallet: 96, maxLayers: 8, light: false, updatedAt: T0 },
  { id: 'adm-i-banh', owner: 'admin', code: 'MAU-BANH', name: 'Bánh kẹo hộp giấy', l: 300, w: 200, h: 150, kg: 1.5, perPallet: 100, maxLayers: 6, light: true, updatedAt: T0 },
]

export const DEFAULT_PALLET_SETTINGS: PalletSettings = { l: 1200, w: 1000, maxH: 1650, baseH: 150, kg: 25 }

// Chuyến mẫu cho lần mở đầu tiên — thấy ngay sơ đồ, không phải nhập gì.
export const SAMPLE_ORDERS: Order[] = [
  { id: 'sample-o1', name: 'Đơn mẫu 1', place: 'Cửa hàng A', updatedAt: T0, lines: [
    { itemId: 'adm-i-chai', qty: 120 }, { itemId: 'adm-i-lon', qty: 160 }, { itemId: 'adm-i-banh', qty: 30 },
  ] },
  { id: 'sample-o2', name: 'Đơn mẫu 2', place: 'Cửa hàng B', updatedAt: T0, lines: [
    { itemId: 'adm-i-mi', qty: 90 }, { itemId: 'adm-i-dau', qty: 60 },
  ] },
]

export const SAMPLE_TRIPS: Trip[] = [
  { id: 'sample-t1', name: 'Chuyến mẫu', vehicleId: 'adm-v-5t', orderIds: ['sample-o1', 'sample-o2'], updatedAt: T0 },
]
