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
  // lòng 9,6 × 2,35 m (chủ dự án 02/11: "xếp sát và chỉnh lại lòng thùng 9m6 × 2m35") — 9 quay ngang + 8 quay dọc = 17 pallet
  { id: 'adm-v-p15t', owner: 'admin', name: 'Xe pallet 15 tấn', plate: '', kind: 'pallet', l: 9600, w: 2350, h: 2600, payloadKg: 15000, updatedAt: T0 },
  // container khô tiêu chuẩn (lòng thùng ISO; tải tối đa 28 tấn — chủ dự án 29/10; 40ft 28,5 tấn — chủ dự án tự sửa mẫu chung 29/10)
  { id: 'adm-v-c20', owner: 'admin', name: 'Container 20ft', plate: '', kind: 'loose', l: 5898, w: 2352, h: 2393, payloadKg: 28000, container: true, updatedAt: T0 },
  { id: 'adm-v-c40', owner: 'admin', name: 'Container 40ft', plate: '', kind: 'loose', l: 12032, w: 2352, h: 2393, payloadKg: 28500, container: true, updatedAt: T0 },
]

// Bản chép bảng `catalog` (admin thay cả bộ 06/11/2026). Mã đơn mẫu dùng: kg + số lớp đã điền; mã còn lại kg = 1 chờ admin khai.
export const ADMIN_ITEMS: Item[] = [
  { id: 'b4e80e14-5754-425b-b656-2fe05ccf5c50', owner: 'admin', code: 'SP001', name: 'TBA 110', l: 425, w: 240, h: 105, kg: 6.2, perPallet: 150, maxLayers: 15, looseLayers: 20, light: false, updatedAt: T0 },
  { id: '17047429-4e68-4236-8d2e-1b91b8eac4be', owner: 'admin', code: 'SP002', name: 'TBA 180', l: 425, w: 260, h: 145, kg: 10, perPallet: 110, maxLayers: 11, looseLayers: 15, light: false, updatedAt: T0 },
  { id: 'b4cd3e0b-50a5-4c50-b49a-b3f07847599b', owner: 'admin', code: 'SP003', name: 'TBA 100', l: 430, w: 240, h: 105, kg: 5.7, perPallet: 150, maxLayers: 14, looseLayers: 20, light: false, updatedAt: T0 },
  { id: '681a1674-9181-4569-baaa-71f06618cf48', owner: 'admin', code: 'SP004', name: 'TBA 100x36', l: 370, w: 220, h: 105, kg: 4.32, perPallet: 182, maxLayers: 14, looseLayers: 20, light: false, updatedAt: T0 },
  { id: '9f03e562-f28e-4ee7-b959-aa0b46e0e362', owner: 'admin', code: 'SP005', name: 'TBA 100 Thạch', l: 425, w: 255, h: 110, kg: 5.75, perPallet: 150, maxLayers: 15, looseLayers: 20, light: false, updatedAt: T0 },
  { id: 'bfeba6de-90ac-4375-ac88-f3ca0de4b2f2', owner: 'admin', code: 'SP006', name: 'TBA 170', l: 430, w: 260, h: 135, kg: 9.55, perPallet: 110, maxLayers: 11, looseLayers: 15, light: false, updatedAt: T0 },
  { id: 'd131667b-61d1-4f65-816e-87c1b1ffe5e2', owner: 'admin', code: 'SP007', name: 'TBA 170 Thạch', l: 425, w: 285, h: 140, kg: 9.55, perPallet: 110, maxLayers: 11, looseLayers: 14, light: false, updatedAt: T0 },
  { id: '89e64f1f-548f-487d-aec8-74ce5c0d1580', owner: 'admin', code: 'SP008', name: 'ECOLEAN', l: 315, w: 140, h: 135, kg: 3.08, perPallet: 224, maxLayers: 8, looseLayers: 11, light: true, updatedAt: T0 },
  { id: '7f577621-125d-45e7-81eb-36a985e8996c', owner: 'admin', code: 'SP009', name: 'TBA 180 SBN', l: 280, w: 230, h: 135, kg: 5, perPallet: 209, maxLayers: 10, light: false, updatedAt: T0 },
  { id: '632dd554-6edf-4366-b78e-689b304fa82a', owner: 'admin', code: 'SP010', name: 'HDPE', l: 360, w: 285, h: 110, kg: 5.9, perPallet: 156, maxLayers: 13, looseLayers: 15, light: false, updatedAt: T0 },
  { id: 'b20729b9-7bd2-436f-8f37-5e7e55d69e36', owner: 'admin', code: 'SP011', name: 'XÚC XÍCH MÌ + KẸO NỔ', l: 350, w: 260, h: 235, kg: 2.4, perPallet: 78, maxLayers: 6, light: false, updatedAt: T0 },
  { id: '190e3f30-1879-4e1c-89d2-697f5b2f49ff', owner: 'admin', code: 'SP012', name: 'XÚC XÍCH LY', l: 360, w: 250, h: 265, kg: 3.5, perPallet: 65, maxLayers: 5, light: false, updatedAt: T0 },
  { id: 'bb30813f-367f-4ace-b819-ca1baf851788', owner: 'admin', code: 'SP013', name: 'THẠCH KẸO 300G', l: 410, w: 230, h: 165, kg: 6.9, perPallet: 72, maxLayers: 6, light: false, updatedAt: T0 },
  { id: 'adb606ed-9cb7-4587-8462-0bca533c4d71', owner: 'admin', code: 'SP014', name: 'THẠCH RAU CÂU 30g', l: 305, w: 215, h: 160, kg: 5.3, perPallet: 136, maxLayers: 8, light: false, updatedAt: T0 },
  { id: 'b9b51ccf-1faa-41a5-927d-ad6542539efa', owner: 'admin', code: 'SP015', name: 'PET 240 ( Matcha )', l: 320, w: 215, h: 180, kg: 6.8, perPallet: 128, maxLayers: 8, looseLayers: 11, light: false, updatedAt: T0 },
  { id: 'f547412b-aba9-4608-901a-c4d2390d2d49', owner: 'admin', code: 'SP016', name: 'PET 430 ( Manuka )', l: 385, w: 255, h: 215, kg: 11.8, perPallet: 77, maxLayers: 7, looseLayers: 9, light: false, updatedAt: T0 },
]

export const DEFAULT_PALLET_SETTINGS: PalletSettings = { l: 1200, w: 1000, maxH: 1650, baseH: 150, kg: 25, gap: 0 }

// Hai chuyến mẫu cho lần mở đầu tiên — thấy ngay sơ đồ, không phải nhập gì. Đơn NHIỀU MÃ, có MÃ NHẸ (chủ dự án 06/11):
// xe pallet đủ 17 pallet (13 chẵn + 2 gộp chung + 2 lẻ riêng; ECOLEAN lẻ nằm trên pallet gộp; bật "Hàng nhẹ: pallet riêng" ⇒ 18, thiếu 1 chỗ)
// · container 40ft xếp rời trên 90% tải, ECOLEAN gom đầu xe trên nóc Xúc xích ly.
export const SAMPLE_ORDERS: Order[] = [
  { id: 'sample-o1', name: 'Đơn mẫu pallet', place: 'Nhà phân phối A', updatedAt: T0, lines: [
    { itemId: 'b4e80e14-5754-425b-b656-2fe05ccf5c50', qty: 480 }, { itemId: 'b4cd3e0b-50a5-4c50-b49a-b3f07847599b', qty: 420 }, { itemId: 'bfeba6de-90ac-4375-ac88-f3ca0de4b2f2', qty: 600 },
    { itemId: '17047429-4e68-4236-8d2e-1b91b8eac4be', qty: 60 }, { itemId: '89e64f1f-548f-487d-aec8-74ce5c0d1580', qty: 480 }, { itemId: '190e3f30-1879-4e1c-89d2-697f5b2f49ff', qty: 120 },
  ] },
  { id: 'sample-o2', name: 'Đơn mẫu 40ft', place: 'Kho B', updatedAt: T0, lines: [
    { itemId: '17047429-4e68-4236-8d2e-1b91b8eac4be', qty: 1450 }, { itemId: 'b4e80e14-5754-425b-b656-2fe05ccf5c50', qty: 1500 }, { itemId: '89e64f1f-548f-487d-aec8-74ce5c0d1580', qty: 600 }, { itemId: '190e3f30-1879-4e1c-89d2-697f5b2f49ff', qty: 150 },
  ] },
]

// đơn 40ft đời trước (2 đời mẫu cuối trong PREV_SAMPLES dùng chung)
const O2_PREV: Order = { id: 'sample-o2', name: 'Đơn mẫu 40ft', place: 'Kho B', updatedAt: T0, lines: [
  { itemId: 'adm-i-st180', qty: 1350 }, { itemId: 'adm-i-st110', qty: 1400 }, { itemId: 'adm-i-tui110', qty: 1600 },
] }

export const SAMPLE_TRIPS: Trip[] = [
  { id: 'sample-t1', name: 'Mẫu pallet', vehicleId: 'adm-v-p15t', orderIds: ['sample-o1'], updatedAt: T0 },
  { id: 'sample-t2', name: 'Mẫu 40ft', vehicleId: 'adm-v-c40', orderIds: ['sample-o2'], updatedAt: T0 },
]

// Chuyến mẫu ĐỜI TRƯỚC — máy cũ / bản sao lưu còn giữ nguyên một đời này ⇒ chỉ thay bằng mẫu mới, không tách thành
// chuyến của người dùng. Đổi số / tên mẫu ⇒ thêm đời đang chạy vào đây.
export const PREV_SAMPLES: { trips: Trip[]; orders: Order[] }[] = [
  { // 27–29/10/2026: xe 5 tấn, 2 đơn
    trips: [{ id: 'sample-t1', name: 'Chuyến mẫu', vehicleId: 'adm-v-5t', orderIds: ['sample-o1', 'sample-o2'], updatedAt: T0 }],
    orders: [
      { id: 'sample-o1', name: 'Đơn mẫu 1', place: 'Cửa hàng A', updatedAt: T0, lines: [
        { itemId: 'adm-i-st180', qty: 150 }, { itemId: 'adm-i-st110', qty: 160 }, { itemId: 'adm-i-tui110', qty: 40 },
      ] },
      { id: 'sample-o2', name: 'Đơn mẫu 2', place: 'Cửa hàng B', updatedAt: T0, lines: [
        { itemId: 'adm-i-scu180', qty: 100 }, { itemId: 'adm-i-c100', qty: 120 },
      ] },
    ],
  },
  { // 29/10/2026 tối: cùng 2 chuyến như bây giờ, số khác (thạch lẻ đã đứng riêng — công tắc hàng nhẹ không đổi gì)
    trips: SAMPLE_TRIPS,
    orders: [
      { id: 'sample-o1', name: 'Đơn mẫu pallet', place: 'Nhà phân phối A', updatedAt: T0, lines: [
        { itemId: 'adm-i-st110', qty: 620 }, { itemId: 'adm-i-c100', qty: 479 }, { itemId: 'adm-i-c85', qty: 612 },
        { itemId: 'adm-i-th170', qty: 60 }, { itemId: 'adm-i-st180', qty: 140 }, { itemId: 'adm-i-tui110', qty: 492 },
      ] },
      { id: 'sample-o2', name: 'Đơn mẫu 40ft', place: 'Kho B', updatedAt: T0, lines: [
        { itemId: 'adm-i-st180', qty: 1100 }, { itemId: 'adm-i-st110', qty: 900 }, { itemId: 'adm-i-tui110', qty: 600 },
      ] },
    ],
  },
  { // tới 05/11/2026: dòng Sữa chua chai 100ml — admin đã xoá mã này khỏi mẫu chung (03/11)
    trips: SAMPLE_TRIPS,
    orders: [
      { id: 'sample-o1', name: 'Đơn mẫu pallet', place: 'Nhà phân phối A', updatedAt: T0, lines: [
        { itemId: 'adm-i-st110', qty: 740 }, { itemId: 'adm-i-c100', qty: 479 }, { itemId: 'adm-i-c85', qty: 612 },
        { itemId: 'adm-i-th170', qty: 40 }, { itemId: 'adm-i-st180', qty: 140 }, { itemId: 'adm-i-tui110', qty: 472 },
      ] },
      O2_PREV,
    ],
  },
  { // tới 06/11/2026: mã cũ, admin đã thay cả bộ mẫu chung bằng SP001–SP016
    trips: SAMPLE_TRIPS,
    orders: [
      { id: 'sample-o1', name: 'Đơn mẫu pallet', place: 'Nhà phân phối A', updatedAt: T0, lines: [
        { itemId: 'adm-i-st110', qty: 740 }, { itemId: '961dcd8c-92c7-4f7a-b84f-c5223ec13433', qty: 479 }, { itemId: 'adm-i-c85', qty: 612 },
        { itemId: 'adm-i-th170', qty: 40 }, { itemId: 'adm-i-st180', qty: 140 }, { itemId: 'adm-i-tui110', qty: 472 },
      ] },
      O2_PREV,
    ],
  },
  { // 06/11/2026, vài giờ: bộ SP001–SP016, Mẫu pallet 16 pallet (chủ dự án: "sao không được 17")
    trips: SAMPLE_TRIPS,
    orders: [
      { id: 'sample-o1', name: 'Đơn mẫu pallet', place: 'Nhà phân phối A', updatedAt: T0, lines: [
        { itemId: 'b4e80e14-5754-425b-b656-2fe05ccf5c50', qty: 840 }, { itemId: 'b4cd3e0b-50a5-4c50-b49a-b3f07847599b', qty: 460 }, { itemId: 'bfeba6de-90ac-4375-ac88-f3ca0de4b2f2', qty: 240 },
        { itemId: '17047429-4e68-4236-8d2e-1b91b8eac4be', qty: 240 }, { itemId: '89e64f1f-548f-487d-aec8-74ce5c0d1580', qty: 320 }, { itemId: '190e3f30-1879-4e1c-89d2-697f5b2f49ff', qty: 80 },
      ] },
      SAMPLE_ORDERS[1],
    ],
  },
]
