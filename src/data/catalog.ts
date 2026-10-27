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

// Cỡ thùng hàng sữa & đồ uống đóng hộp phổ biến (thùng 48 hộp / chai, thùng 24 túi) — số đo, kg, số thùng / pallet
// và số lớp chồng lấy theo thùng thật trong kho; tên ghi chung, không nhãn hiệu.
export const ADMIN_ITEMS: Item[] = [
  { id: 'adm-i-st180', owner: 'admin', code: 'MAU-ST180', name: 'Sữa tươi tiệt trùng hộp 180ml · thùng 48', l: 420, w: 255, h: 130, kg: 9.85, perPallet: 110, maxLayers: 11, light: false, updatedAt: T0 },
  { id: 'adm-i-st110', owner: 'admin', code: 'MAU-ST110', name: 'Sữa tiệt trùng hộp 110ml · thùng 48', l: 420, w: 255, h: 100, kg: 6.2, perPallet: 140, maxLayers: 14, light: false, updatedAt: T0 },
  { id: 'adm-i-scu180', owner: 'admin', code: 'MAU-SCU180', name: 'Sữa chua uống hộp 180ml · thùng 48', l: 420, w: 255, h: 130, kg: 10.05, perPallet: 110, maxLayers: 11, light: false, updatedAt: T0 },
  { id: 'adm-i-th170', owner: 'admin', code: 'MAU-TH170', name: 'Sữa có thạch hộp 170ml · thùng 48', l: 430, w: 250, h: 130, kg: 9.5, perPallet: 100, maxLayers: 11, light: false, updatedAt: T0 },
  { id: 'adm-i-c100', owner: 'admin', code: 'MAU-C100', name: 'Sữa chua uống chai 100ml · thùng 48', l: 430, w: 250, h: 100, kg: 5.9, perPallet: 143, maxLayers: 14, light: false, updatedAt: T0 },
  { id: 'adm-i-c85', owner: 'admin', code: 'MAU-C85', name: 'Sữa trái cây chai 85ml · thùng 48', l: 357, w: 276, h: 105, kg: 5.05, perPallet: 143, maxLayers: 13, light: false, updatedAt: T0 },
  // túi nhẹ, xếp được lên mặt khối hàng khác
  { id: 'adm-i-tui110', owner: 'admin', code: 'MAU-TUI110', name: 'Thạch / nước túi 110ml · thùng 24', l: 310, w: 130, h: 130, kg: 3.08, perPallet: 216, maxLayers: 8, light: true, updatedAt: T0 },
]

export const DEFAULT_PALLET_SETTINGS: PalletSettings = { l: 1200, w: 1000, maxH: 1650, baseH: 150, kg: 25 }

// Chuyến mẫu cho lần mở đầu tiên — thấy ngay sơ đồ, không phải nhập gì.
export const SAMPLE_ORDERS: Order[] = [
  { id: 'sample-o1', name: 'Đơn mẫu 1', place: 'Cửa hàng A', updatedAt: T0, lines: [
    { itemId: 'adm-i-st180', qty: 150 }, { itemId: 'adm-i-st110', qty: 160 }, { itemId: 'adm-i-tui110', qty: 40 },
  ] },
  { id: 'sample-o2', name: 'Đơn mẫu 2', place: 'Cửa hàng B', updatedAt: T0, lines: [
    { itemId: 'adm-i-scu180', qty: 100 }, { itemId: 'adm-i-c100', qty: 120 },
  ] },
]

export const SAMPLE_TRIPS: Trip[] = [
  { id: 'sample-t1', name: 'Chuyến mẫu', vehicleId: 'adm-v-5t', orderIds: ['sample-o1', 'sample-o2'], updatedAt: T0 },
]
