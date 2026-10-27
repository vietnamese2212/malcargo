# MalCargo

Mô phỏng xếp hàng lên xe tải: khai **mã hàng**, **xe**, **đơn** — app ra khối lượng, thể tích, số pallet, xe vừa nhất, bảng đếm chân và sơ đồ 3D xếp từng bước. Sẽ chạy tại **cargo.mal.com.vn**, cài được như app (PWA) và có APK.

## Chạy

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # kiểm thuật toán
npm run check:ui   # build + chụp mọi màn + luồng người mới (ảnh ra scripts/out/)
```

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `src/engine/` | Thuật toán xếp (bản chép từ SUPPLYC), lớp ghép dữ liệu, worker |
| `src/three/` | Xe, hàng, khung cảnh 3D |
| `src/data/` | Kiểu dữ liệu, danh mục mẫu chung, kho dữ liệu trên máy |
| `src/pages/`, `src/ui/` | Giao diện |
| `scripts/` | Kiểm thuật toán, chụp màn, luồng người dùng |

Luật làm việc và các quyết định đã chốt: xem `CLAUDE.md`.
