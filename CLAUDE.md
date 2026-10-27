# MalCargo — mô phỏng xếp hàng lên xe tải

App ĐỘC LẬP, CHỈ MÔ PHỎNG: người dùng tự khai **mã hàng**, **xe**, **đơn** → app ra khối lượng, thể tích, số pallet, gợi ý xe vừa nhất, **bảng đếm chân** và sơ đồ 3D xếp từng bước. Trình duyệt + PWA + APK. Không nối dữ liệu với phần mềm kho nào.

Ghi chú nội bộ của chủ dự án (không nằm trong repo công khai): @CLAUDE.local.md

## Quy tắc làm việc
- Trao đổi **tiếng Việt**.
- Repo **công khai**: không ghi tên công ty, thông tin cá nhân, kế hoạch kinh doanh, mã hạ tầng vào code, comment, commit message hay file này — những thứ đó để ở `CLAUDE.local.md` (đã gitignore).
- Nghĩ từ **góc người dùng ngoài** (thủ kho, điều vận, nhà xe nội địa): cấu hình phải hỏi đúng thứ họ trả lời được ngay; giấu mọi tham số kỹ thuật. Đối tượng là **xe tải nội địa**.
- Giữ đơn giản: không thêm tính năng ngoài yêu cầu; sửa đúng chỗ cần sửa.

## Thương hiệu & giao diện
- Logo **MAL** (chữ nghiêng đậm, cùng kiểu mal.com.vn) + nhãn **CARGO** nền xanh — `Logo` trong `src/ui/Shell.tsx`. Tông **navy `#0b1424` + xanh dương `#1a66ff`**. Không dùng xanh lá, bạc, cam / vàng da cam làm màu thương hiệu. Màu thành công/nguy hiểm (emerald/red/amber) chỉ dùng cho trạng thái.
- Font Be Vietnam Pro (tự lưu, chạy offline). Ưu tiên điện thoại, điểm chạm ≥ 44 px. MỘT màn làm việc (**Bàn xếp xe**, `TripPage.tsx`): thanh trên navy CỐ ĐỊNH (menu 3 vạch bên trái · chuyến đang mở ▾ + nút `+` · Login bằng chữ · logo bên phải); danh mục Mã hàng / Xe / Đơn / Chuyến / Tài khoản mở thành tấm phủ (`Panel`) ngay trên màn đó.
- Form thêm/sửa = `Sheet` (trượt từ đáy trên điện thoại, từ lề phải trên máy tính); xác nhận xoá = `Confirm` — cấm `window.confirm/alert`.
- Nút chỉ có biểu tượng PHẢI có `aria-label` (script kiểm tìm nút theo tên).
- **Không cắt chữ "…"**: tên, quy cách, ghi chú phải XUỐNG DÒNG (`break-words`; cụm số như `5.700 × 2.000 × 2.000 mm` bọc `whitespace-nowrap` để không bẻ giữa cụm). `truncate` chỉ dùng chỗ buộc một dòng mà vẫn đủ chỗ ở 360 px (tên chuyến trên thanh trên). `scripts/ui-cut.mjs` đo ở 1440 / 390 / 360 px.
- Số kiểu Việt Nam (`12,5 kg`, `5.700 mm`) — dùng `fmtInt/fmtDec/fmtKgShort/fmtM3` trong `src/ui/kit.tsx`, đừng in số thô.
- Đơn vị: kích thước luôn **mm**, khối lượng **kg**.

## Thuật toán xếp (`src/engine/`)
- `loadPlan.ts` = bản chép nguyên thuật toán xếp của SUPPLYC. Luật xếp theo quy trình "đếm chân xe xá": xếp bằng mặt (một loại hàng một chiều cao), thùng thừa nổi trên khối, hết loại này mới tới loại khác, khối trong cao thấp dần ra cửa, xe nhiều điểm giao xếp từng đơn.
- **Không sửa lõi ở đây.** Sửa luật xếp ở bản gốc rồi chép lại file sang → `npm test`. Chỗ nào cần khác thì vá ở lớp ghép `plan.ts`.
- Luật 8 (27/10): mọi chỗ đặt thùng LÊN MẶT khối khác (hàng nhẹ, hàng lên nóc pallet) đi qua `levelFill` — lát kín kiểu rót nước, không tháp lẻ; pallet gộp chia cho cao đều. Ca "hàng nhẹ thùng to ở đơn xếp sau" lõi đã tự xếp được; lớp dự phòng trong `plan.ts` vẫn giữ cho chắc.
- Bộ đo hình khối: `node scripts/out/q.mjs` (gitignore — chép lại từ phiên trước nếu mất) — ma trận xe × đơn, đếm tháp / treo / vực / chồng lấn / pallet lùn.
- Pipeline: xe xá → `computeLoadPlan`; xe pallet → `palletizeGroups` rồi hàng nhẹ `spreadOnTopOfPallets` (chuyến bật **Hàng nhẹ đóng pallet** — `Trip.lightInPallet`, công tắc trên dải thông số xe — thì hàng nhẹ đóng pallet như hàng khác: pallet chẵn + phần lẻ dồn chung pallet gộp của đơn). Đơn GIAO TRƯỚC xếp SAU CÙNG (sát cửa). Bảng đếm chân = gom thùng theo (x,y) → "n chân × L lớp". Gợi ý xe = xe CÙNG KIỂU nhỏ nhất (thể tích) chở hết + không vượt tải.
- Tính trong Web Worker (`worker.ts`); three.js chỉ tải khi màn 3D mở (`src/three/LazyScene.tsx`) — **đừng import `three` vào file nằm ngoài `src/three/`** trừ qua LazyScene (sẽ kéo ~550 KB vào gói chính).

## Đồ hoạ 3D (`src/three/`)
- Xe dựng bằng code theo lòng thùng khai (`truckModel.ts`): cabin đầu bằng kính ngả, tấm chắn gió khi thùng cao hơn cabin, bánh đôi sau, trục kép khi dài > 7 m, khung nhôm, sàn gỗ, cửa sau mở. Hệ trục: X dọc xe (0 = vách đầu thùng, cabin ở X âm), Y lên, Z ngang. Thuật toán: x dọc · y RỘNG · z CAO (đổi trục khi vẽ).
- Hàng (`cargo.ts`): thùng carton InstancedMesh mỗi mã (băng keo, nhãn, màu mã pha giấy kraft — `colors.ts`); pallet = ván + 9 chân gỗ + khối quấn màng.
- Màu CỐ ĐỊNH theo MÃ (`itemColors`; mã mẫu có màu ghim sẵn), KHÔNG theo thứ tự xếp — bật công tắc / đổi xe / đổi số không được làm đổi màu hàng. Bấm dòng hàng / dải số của đơn ⇒ chỉ khối của nó trên xe (pallet gộp chứa phần lẻ của mã cũng sáng — `PlanGroupMeta.holds`), vẫn chỉ đúng nó khi sơ đồ tính lại.
- Góc nhìn căn theo khối cầu bao xe (`goTo` trong `TruckScene.tsx`) — xe nào, màn nào cũng lọt trọn. "Ẩn vách" ẩn cả cột + vòm nóc phía người xem.

## Dữ liệu
- Trên máy: `zustand` + localStorage key `malcargo-data-v1` (`src/data/store.ts`); sao lưu / nạp file JSON (`app: 'malcargo'`); nhập Excel bằng file mẫu 4 trang (`src/data/importer.ts`).
- **Chuyến mẫu** (`sample-t1` + đơn `sample-o1/o2`) luôn nguyên gốc: không xoá; sửa bất cứ gì ⇒ store tự TÁCH thành chuyến mới mã `ddmmyy-hhmm-stt` (`makeFork` trong store.ts), màn chuyến chuyển sang đó tại chỗ. Chuyến mới nào cũng có mã này (tên mặc định = mã).
- Tài khoản (`src/data/cloud.ts`): đăng nhập **Google** qua Supabase; chưa đăng nhập vẫn dùng đủ, đăng nhập thì dữ liệu trên máy tự gộp lên tài khoản rồi đồng bộ. Chưa khai `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (`.env.local`, xem `.env.example`) ⇒ app chạy chỉ-trên-máy.
- Supabase (`supabase/schema.sql`, chạy lại được): `catalog` (mẫu chung xe + mã hàng: ai cũng đọc, chỉ admin ghi), `user_data` (một JSON / người), `admins` (email được sửa mẫu chung) — tất cả bật RLS theo `auth.uid()` / email.
- Mẫu chung: admin sửa trên giao diện (form Xe / Mã hàng có nút "Lưu mẫu chung"); `src/data/catalog.ts` chỉ là bản mặc định khi chưa nối máy chủ + dữ liệu nạp đầu trong `schema.sql` (giữ hai nơi khớp nhau). Người thường sửa mẫu ⇒ thành bản "của tôi".
- Chia sẻ (chưa làm): gửi link, người nhận LƯU BẢN SAO.

## Kiểm trước khi báo xong
```bash
npm test            # thuật toán: bất biến hình học + bảng đếm chân khớp số đã xếp (6 ca)
npm run check:ui    # build + chụp mọi màn 1440/390 (đo tràn ngang, lỗi trình duyệt) + luồng người mới + chữ bị cắt / nút đè (1440/390/360)
```
Ảnh ra `scripts/out/` — mở xem bằng mắt, đừng chỉ tin chữ XANH. Script KHÔNG bấm link ra ngoài (Zalo/email/mal.com.vn): `mailto:` từng mở Outlook thật trên máy.
