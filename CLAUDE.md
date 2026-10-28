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
- Số theo ngôn ngữ (`12,5 kg` · `5.700 mm` tiếng Việt; `12.5 kg` · `5,700 mm` tiếng Anh) — dùng `fmtInt/fmtDec/fmtKgShort/fmtM3` trong `src/ui/kit.tsx`, đừng in số thô, đừng gõ cứng 'vi-VN' / "tấn".

## Hai ngôn ngữ (`src/i18n/`)
- **Mặc định tiếng Anh**; nút VI/EN cạnh Login (`ui/LangSwitch.tsx`), nhớ trên máy (localStorage `malcargo-lang-v1`). Đổi ngôn ngữ ⇒ App dựng lại toàn bộ (key = ngôn ngữ).
- Tiếng Việt là chuỗi GỐC viết thẳng trong code, bọc `t('…')`; tiếng Anh tra `src/i18n/en/*.ts` theo đúng chuỗi gốc (sửa chữ tiếng Việt ⇒ sửa khoá bên bảng dịch). Biến `t('Thêm vào {name}', { name })`; số ít / nhiều tiếng Anh `'{n} {n:carton|cartons}'`. KHÔNG gọi `t()` ở cấp module — nhãn khai sẵn (mảng VIEWS…) ghi `// i18n-key` cuối dòng rồi gọi `t(nhãn)` lúc vẽ.
- `tx()` cho chữ do DỮ LIỆU MẪU / THUẬT TOÁN sinh: tên mã / xe / chuyến / đơn mẫu (`EN_NAMES`), nhãn pallet gộp và cảnh báo của `plan.ts` — Worker không biết ngôn ngữ (`EN_RULES` trong `src/i18n/en.ts`; đổi câu cảnh báo ở plan.ts / lõi ⇒ sửa luật). Dữ liệu người dùng tự khai giữ nguyên; không đưa chữ đã dịch vào ô nhập / dữ liệu lưu.
- `npm test` chạy `scripts/check-i18n.mjs`: chuỗi `t()` thiếu bản dịch, lệch biến, chữ tiếng Việt trần chưa bọc (cố ý giữ — tiêu đề cột file Excel mẫu… — ghi `// i18n-ok`). Script UI chạy tiếng Việt; `--en` soát bản tiếng Anh (`T()/TX()` trong `scripts/ui-lib.mjs` lấy tên nút theo bảng dịch).
- Đơn vị: kích thước luôn **mm**, khối lượng **kg**.

## Thuật toán xếp (`src/engine/`)
- `loadPlan.ts` = bản chép nguyên thuật toán xếp của SUPPLYC. Luật xếp theo quy trình "đếm chân xe xá": xếp bằng mặt (một loại hàng một chiều cao), thùng thừa nổi trên khối, hết loại này mới tới loại khác, khối trong cao thấp dần ra cửa, xe nhiều điểm giao xếp từng đơn.
- **Không sửa lõi ở đây.** Sửa luật xếp ở bản gốc rồi chép lại file sang → `npm test`. Chỗ nào cần khác thì vá ở lớp ghép `plan.ts`.
- Luật 8 (27/10): mọi chỗ đặt thùng LÊN MẶT khối khác (hàng nhẹ, hàng lên nóc pallet) đi qua `levelFill` — lát kín kiểu rót nước, không tháp lẻ; pallet gộp chia cho cao đều. Ca "hàng nhẹ thùng to ở đơn xếp sau" lõi đã tự xếp được; lớp dự phòng trong `plan.ts` vẫn giữ cho chắc.
- 28/10 (lõi, luật 9-10): xe xá — mỗi khối chiếm TRỌN hàng ngang (dư nổi nóc); hàng nhẹ của đơn thành MỘT khối rót nước trên nóc khối nền đầu của đơn (nền hạ thấp trải rộng để nền + nhẹ ≈ mức khối nền lẽ ra đứng; bậc thang tính cả khối nhẹ); xe chật mà trọn hàng phải bỏ thùng thì lùi cách cũ. Xe pallet — thùng/lớp = Thùng/pallet ÷ Chồng tối đa, làm tròn lên (110 ÷ 11 ⇒ 10/lớp × 11 lớp; không khai số lớp ⇒ nhiều nhất gọn trong chân), xếp theo `layerPattern`: gọn trong chân (cắt chém hoặc chong chóng — 420×255 được 10), chân không chứa nổi thì chờm mép ít nhất (430×250 11/lớp chờm 45mm mỗi đầu) và khối pallet nới đúng phần chờm (`palletFoot`); phần lẻ MỖI MÃ nằm nguyên MỘT pallet, dồn pallet gộp ≤ 1,65m (lớp thiếu thùng của mã dưới tính cao bằng thùng mã trên nếu thùng ấy cao hơn — lớp đó phải lấp phẳng, `stackH`), hàng nhẹ (`onTop`) trên cùng; khối pallet kèm ruột `contents` (lớp có `per` = thùng/lớp đầy).
- Xe pallet ở `plan.ts`: KHÔNG rải thùng rời lên nóc nhiều pallet nữa — mọi hàng nằm gọn trên pallet của nó; chuyến bật "Hàng nhẹ: pallet riêng" (`Trip.lightOwnPallet`) ⇒ phần lẻ hàng nhẹ vào bể riêng (pallet riêng). `packPallet` xếp theo LỚP PHẲNG, phủ kín (chủ dự án 28/10: "phía dưới phải phủ hết, kể cả 1 lớp nhiều mặt hàng; dưới không chắc thì không xếp lên được"): lớp đủ của từng mã hàng thường dưới cùng (mẫu `runPattern` hoặc bản lật của nó) → phần lẻ ghép thành LỚP HỖN HỢP → hàng nhẹ trên cùng. Lớp hỗn hợp THỬ nhiều cách đặt (ô mẫu lớp đủ bỏ trống dồn một cạnh / mẫu gọn đúng số thùng ở giữa hay một góc; hàng nhẹ lấp đặt đúng ô mẫu lớp đủ của nó) rồi chọn: đặt hết hàng thường → lớp kế (mẫu của mã sẽ xếp tiếp) ít thiếu đỡ nhất → phủ kín → gọn (chủ dự án 28/10 tối: lớp đáy vài thùng lẻ + thạch lấp lỗ chỗ ⇒ thạch chồng 11 lớp thành tháp, "sai nguyên tắc số lớp"). Chỗ đỡ ≥ 70% đáy (thùng dưới thấp hơn ≤ 35mm vẫn tính); ô của mẫu lớp đủ ≥ 50% mà trọng tâm nằm trên thùng dưới cũng được (mẫu chờm mép); hàng nhẹ được GÁC qua khe lớp ghép ≥ 30% khi mẫu đủ không đặt trọn được (không thế thì lớp nào cũng hụt ⇒ tháp). Mỗi CỘT thùng cùng mã ≤ số lớp tối đa của mã; chỉ lớp trên cùng được thiếu, cụm thùng lớp đó dời về giữa chân. Khối pallet cao đúng đỉnh thùng thật. `npm test` kiểm đủ thùng, chỗ đỡ, không nhiều lớp hơn lõi tính (tháp), cột ≤ số lớp, ≤ trần; `scripts/out/audit.mjs` quét ngẫu nhiên + quanh chuyến mẫu (còn 2/6.657 pallet ngẫu nhiên dư 1 lớp — 2 mã thường lệch cỡ đáy để lại lỗ không mã nào lấp vừa) → `PlanGroupMeta.cartons` (toạ độ theo góc KHỐI) + `deck` (chỗ tấm gỗ trong khối); `spacePallets` dàn sàn thừa thành khe ≤ 80mm — mỗi pallet lùi theo số pallet đứng trước nó cùng dải (pallet xoay / khối chờm ở làn bên không bị đè).
- Bộ đo hình khối: `node scripts/out/q.mjs` (gitignore — chép lại từ phiên trước nếu mất) — ma trận xe × đơn, đếm tháp / treo / vực / chồng lấn / pallet lùn.
- Pipeline: xe xá → `computeLoadPlan`; xe pallet → `palletizeGroups` (mọi hàng, kể cả hàng nhẹ) → `computeLoadPlan` xếp các khối pallet → `spacePallets`. Công tắc **Hàng nhẹ: pallet riêng** (dải thông số xe) chỉ quyết phần lẻ hàng nhẹ đứng pallet riêng hay dồn lên trên cùng pallet gộp. Đơn GIAO TRƯỚC xếp SAU CÙNG (sát cửa). Bảng đếm chân = gom thùng theo (x,y) → "n chân × L lớp". Gợi ý xe = xe CÙNG KIỂU nhỏ nhất (thể tích) chở hết + không vượt tải, chỉ trong CÙNG DÒNG xe (`pickPool` trong `data/resolve.ts`): chưa có xe / đang xe tải ⇒ chỉ xe tải; `Vehicle.container` (form xe: "Dòng xe") chỉ khi người dùng tự chọn container.
- **Diễn giải từng mã** (`engine/explain.ts` + `pages/TripExplain.tsx`, khối giữa "Hàng" và "Bảng đếm chân" — chủ dự án 28/10: "cao bao nhiêu, lẻ bao nhiêu của từng mã, tính trước khi lên hàng, không cần bước trước bước sau"): thùng rời — khối N chân × L lớp (L = số lớp cho phần đủ lớp nhiều thùng nhất), cao bao nhiêu mét, chiếm bao nhiêu mét dọc xe, lẻ = chân thấp hơn + thùng nổi trên mặt; pallet — mỗi mã mấy pallet chẵn (thùng/lớp × lớp, cao), lẻ bao nhiêu nằm pallet nào lớp thứ mấy; ruột pallet gộp từ dưới lên. `npm test` kiểm phần đủ + lẻ cộng đúng số thùng.
- Tính trong Web Worker (`worker.ts`); three.js chỉ tải khi màn 3D mở (`src/three/LazyScene.tsx`) — **đừng import `three` vào file nằm ngoài `src/three/`** trừ qua LazyScene (sẽ kéo ~550 KB vào gói chính).

## Đồ hoạ 3D (`src/three/`)
- Xe dựng bằng code theo lòng thùng khai (`truckModel.ts`): cabin đầu bằng kính ngả, tấm chắn gió khi thùng cao hơn cabin, bánh đôi sau, trục kép khi dài > 7 m, khung nhôm, sàn gỗ, cửa sau mở. Hệ trục: X dọc xe (0 = vách đầu thùng, cabin ở X âm), Y lên, Z ngang. Thuật toán: x dọc · y RỘNG · z CAO (đổi trục khi vẽ).
- Hàng (`cargo.ts`): thùng carton InstancedMesh mỗi mã (băng keo, nhãn, màu mã pha giấy kraft — `colors.ts`); pallet = ván + 9 chân gỗ đúng cỡ chân (`PlanGroupMeta.deck`) + **từng thùng thật** đã xếp (`PlanGroupMeta.cartons`, toạ độ theo khối — `onPallet` đổi trục khi pallet đặt xoay; không có ruột ⇒ khối quấn màng). Thùng nằm gọn trong chân, chỉ chờm mép khi quy cách buộc vậy. Pallet gộp kể ruột ở bảng đếm chân (`mix`).
- Thẻ đơn trên Bàn xếp xe: bấm TÊN đơn hay dải số ⇒ chỉ hàng của đơn trên xe (không phải ô nhập); sửa tên / điểm giao bằng nút "Sửa" ⇒ popup `OrderSheet`.
- Dòng hàng trên Bàn xếp xe hiện quy cách xếp "110 thùng/pallet · 11 lớp · 9,85 kg" (chưa khai thùng/pallet lẫn số lớp mới hiện cỡ thùng) + nút chữ "Sửa" mở POPUP `ItemSheet` (cùng form danh mục Mã hàng — không sửa trong dòng, chủ dự án thấy rối): mã mẫu Lưu ⇒ thành mã của tôi rồi thay vào các đơn của chuyến (`adoptItem`); mở từ dòng hàng thì có "Bỏ khỏi đơn" thay cho nút xoá mã.
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
