// Kích thước luôn là MILIMÉT, khối lượng là KG.

/** 'admin' = mẫu chung do admin đưa vào (chỉ đọc) · 'me' = của riêng người dùng */
export type Owner = 'admin' | 'me'

export interface Item {
  id: string
  owner: Owner
  code: string
  name: string
  l: number; w: number; h: number   // kích thước THÙNG (mm)
  kg: number | null                 // kg / thùng
  perPallet: number | null          // số thùng / pallet — chỉ cần khi chở xe pallet
  maxLayers: number | null          // chồng tối đa (lớp) — trống = tự tính theo chiều cao xe
  light: boolean                    // hàng nhẹ: cho lên trên hàng khác
  updatedAt: number
}

export type VehicleKind = 'loose' | 'pallet'   // xe xá (thùng rời) · xe pallet

export interface Vehicle {
  id: string
  owner: Owner
  name: string
  plate: string
  kind: VehicleKind
  l: number; w: number; h: number   // LÒNG THÙNG (mm)
  payloadKg: number | null          // tải trọng cho phép
  updatedAt: number
}

export interface OrderLine { itemId: string; qty: number }

export interface Order {
  id: string
  name: string
  place: string        // điểm giao / khách — không bắt buộc
  lines: OrderLine[]
  updatedAt: number
}

export interface Trip {
  id: string
  code?: string        // mã chuyến ddmmyy-hhmm-stt (lúc tạo chuyến); chuyến cũ / nhập từ Excel có thể không có
  name: string
  vehicleId: string | null
  orderIds: string[]   // THỨ TỰ GIAO: đơn đầu giao trước ⇒ xếp sau cùng, sát cửa
  updatedAt: number
}

export interface PalletSettings {
  l: number; w: number   // chân pallet
  maxH: number           // cao tối đa pallet hàng lẻ (gồm đế)
  baseH: number          // cao đế pallet
  kg: number             // khối lượng 1 pallet rỗng
}
