# MalCargo — mô phỏng xếp hàng lên xe tải

App độc lập, chỉ mô phỏng: người dùng tự khai mã hàng, xe, đơn → app ra khối lượng, thể tích, số pallet, gợi ý xe vừa nhất, bảng đếm chân và sơ đồ 3D xếp từng bước. Chạy trên trình duyệt, cài được như app (PWA, APK Android). Không nối dữ liệu với phần mềm kho nào.

- Ghi chú nội bộ của chủ dự án (người, hạ tầng, việc đang chờ): @CLAUDE.local.md
- Ghi chú chi tiết từng phần (lịch sử quyết định, số đo, sự cố): `docs/notes/` — `giao-dien.md`, `thuat-toan.md`, `do-hoa-3d-va-man.md`, `cai-app-du-lieu.md`.
- Bản CLAUDE.md đầy đủ trước khi dọn: `docs/rules/claude-md-full-2026-11-16.md`.

## Cách làm việc

- Trao đổi bằng tiếng Việt.
- Bạn là người bảo trì lâu dài của codebase này. Khi sắp chép lại logic đã có ở chỗ khác, gom về một chỗ dùng chung thay vì thêm bản thứ hai. Ngoài việc đó, giữ thay đổi trong phạm vi yêu cầu và nêu mọi thay đổi ngoài yêu cầu trong báo cáo.
- Làm hết việc được giao. Lỗi thường gặp (lệnh hỏng, hết giờ chờ, cổng chập chờn, bản thật chưa lên) thì tự chẩn đoán và đi tiếp. Lựa chọn kỹ thuật nhỏ và ngưỡng số kỹ thuật thì tự chọn, ghi vào báo cáo.
- Làm luôn, không cần hỏi:
  - đọc và sửa code, viết test, cập nhật `docs/` và skill;
  - chạy `npm test`, `npm run check:ui`, build, preview cục bộ, các script trong `scripts/` và `scripts/out/`;
  - commit và push `main` khi kiểm xanh và rà trước khi push sạch (push `main` là lên bản thật qua Vercel — chủ dự án đã cho tự đẩy), rồi kiểm lại trên bản thật bằng `scripts/out/_prod-sample.mjs`;
  - đọc dữ liệu máy chủ Supabase của MalCargo để chẩn đoán; chạy SQL thử trên máy chủ thật trong một giao dịch tự huỷ (bài thử kết thúc bằng `raise exception 'TEST-OK'`);
  - đọc DB staging của SUPPLYC (chỉ đọc);
  - tạo người dùng thử trên máy chủ để kiểm, xong thì xoá đúng người thử đó;
  - giao cho agent phụ thử app như người dùng mới.
- Hỏi trước khi làm:
  - áp SQL hay ghi dữ liệu lên máy chủ Supabase thật (bảng `catalog`, dữ liệu người dùng, Family) — đó là dữ liệu khách đang dùng, khó hoàn tác;
  - xoá dữ liệu không do mình tạo ra để kiểm;
  - mọi thay đổi trong repo SUPPLYC và push nhánh `dev` của nó — đó là app kho đang chạy thật;
  - đổi một luật nghiệp vụ hay luật xếp mà chủ dự án đã chốt;
  - việc tốn tiền hoặc hạn mức: workflow nhiều agent, mua dịch vụ, gói trả phí;
  - đổi hạ tầng: biến môi trường Vercel, Google OAuth, DNS, build lại APK.
- Câu hỏi về một luật ("sao lại thế này") không phải lệnh đổi luật: giải thích luật, lý do, các phương án, rồi chờ quyết định.
- Tính năng có nhiều luật nghiệp vụ: trước khi code, nêu các ca khó và hỏi chủ dự án một lượt, viết thành bảng "tình huống → kết quả mong muốn", dùng bảng đó làm test.
- Trước khi báo xong: kiểm bằng vai người dùng thật (người dùng thường, thành viên Family, người chỉ xem — không dùng super admin, vì super admin bỏ qua kiểm quyền); chụp màn máy tính (1440) và điện thoại (390, 360) rồi tự xem ảnh, đừng chỉ tin chữ XANH.
- Bài học mới ghi vào `docs/notes/` hoặc skill. CLAUDE.md chỉ giữ luật đang hiệu lực, ngắn.
- Báo cáo: giữa lượt chỉ một dòng trạng thái; tổng kết gom vào một tin cuối, câu ngắn, kết luận trước, nói rõ phần chưa làm và phần cần chủ dự án quyết.

## Quy tắc dự án

- Repo công khai: không ghi tên công ty, thông tin cá nhân, kế hoạch kinh doanh, token hay mã hạ tầng vào code, comment, commit, CLAUDE.md, `docs/` công khai. Những thứ đó để ở `CLAUDE.local.md` và `docs/private/` (cả hai gitignore). Lý do: ai cũng đọc được repo.
- Không bao giờ ghi token, khoá hay mật khẩu vào file được commit. Lý do: lộ là mất quyền máy chủ.
- Người dùng là thủ kho, điều vận, nhà xe nội địa: cấu hình chỉ hỏi thứ họ trả lời được ngay, giấu tham số kỹ thuật.
- Giữ đơn giản: không thêm tính năng ngoài yêu cầu, sửa đúng chỗ cần sửa.
- Đơn vị: kích thước luôn mm, khối lượng kg.

## Giao diện

Chi tiết: `docs/notes/giao-dien.md`, `docs/notes/do-hoa-3d-va-man.md`.

- Thương hiệu: logo MAL + nhãn CARGO (`Logo` trong `src/ui/Shell.tsx`), tông navy `#0b1424` + xanh `#1a66ff`. Không dùng xanh lá, bạc, cam / vàng cam làm màu thương hiệu (chủ dự án đã bác: trông như app máy tạo). Emerald / red / amber chỉ cho trạng thái.
- Font Be Vietnam Pro tự lưu (chạy offline). Ưu tiên điện thoại; điểm chạm ≥ 44 px — chỗ chật dùng lớp `hit`; hai nút sát nhau thì nới chiều cao thật trên cảm ứng (`[@media(pointer:coarse)]:min-h-[40px]`) vì vùng chạm vô hình sẽ đè nút bên cạnh.
- Một màn làm việc là Bàn xếp xe (`src/pages/TripPage.tsx`): thanh navy dính trên cùng (≡ · `+` · ô Chuyến · VI/EN · Login · logo), dải thông số xe + khung 3D, khối Đơn hàng. Danh mục (Mã hàng, Xe, Đơn, Chuyến, Tài khoản, Family, Quản trị) mở thành tấm phủ `Panel` trên màn đó. Đổi bố cục thì giữ các `data-tour` (hướng dẫn nhanh dựa vào chúng).
- Ô Chuyến (`TripSwitch`): tên một dòng (ngoại lệ duy nhất được cắt "…", đánh `data-cut-ok`), bảng ▾ ghi tên đầy đủ, danh sách chuyến gom theo ngày tạo, gập / mở từng ngày (`tripsByDay`, `DayHead`, `useFold`).
- Tên chuyến để hiện luôn qua `tripTitle` (chuyến còn tên mặc định thì gọi theo tên đơn); dữ liệu lưu giữ tên mặc định vì dọn nháp và tách chuyến mẫu dựa vào đó.
- Form thêm / sửa là `Sheet`; xác nhận là `Confirm`. Không dùng `window.confirm/alert` (chặn luồng, không theo giao diện, không chạy trong APK).
- Form có thay đổi chưa lưu: truyền `dirty` cho `Sheet` — chạm ra ngoài / X / Esc / Back sẽ hỏi trước khi bỏ; nút "Huỷ" là chủ ý bỏ nên đóng luôn.
- Mọi khung `fixed` mới (tấm phủ, bảng, khung bám đáy) dùng `useViewportBox` + `KeyboardShield` (bàn phím điện thoại), `useTouchContain` (vuốt không trôi trang sau), `useBackClose` (nút Back đóng khung trên cùng); thêm trạng thái mới vào `STATES` trong `scripts/ui-states.mjs` và vào `scripts/ui-keyboard.mjs` nếu bám đáy. Ô nhập trên điện thoại chữ ≥ 16 px (nhỏ hơn thì iPhone tự phóng to trang).
- Nút chỉ có biểu tượng phải có `aria-label` (script kiểm tìm nút theo tên).
- Không cắt chữ "…": tên, quy cách, ghi chú xuống dòng (`break-words`); cụm số bọc `whitespace-nowrap`. `scripts/ui-cut.mjs` đo.
- Số theo ngôn ngữ: in qua `fmtInt/fmtDec/fmtKgShort/fmtM3/fmtDate`, khối lượng có mã chưa khai kg qua `fmtKgOf` ("≥…" / "?"), đọc số gõ vào qua `parseNum`, ô số thùng dùng `QtyInput`. Đừng in số thô hay gõ cứng 'vi-VN' / "tấn".
- Danh mục chọn nhiều để xoá: `RowCheck` (nằm ngoài nút của dòng) + `SelectBar` + `Confirm`; đơn / chuyến mẫu không có ô chọn.
- Điện thoại không có phần nhập Excel (`usePhone()`).
- Thùng rời ↔ Pallet trên dải thông số là xem tình huống cho chuyến này: ghi vào `Trip.kind`, xe giữ nguyên; cách chở mặc định của xe sửa ở bảng Thùng xe / form Xe. Đổi kiểu chở thì xe và camera đứng yên, chỉ hàng đổi.

## Hai ngôn ngữ (`src/i18n/`)

- Mặc định theo ngôn ngữ của máy (tiếng Việt nếu máy đặt tiếng Việt, còn lại tiếng Anh); người dùng đổi bằng nút VI/EN, nhớ ở localStorage.
- Tiếng Việt là chuỗi gốc viết trong code, bọc `t('…')`; bản tiếng Anh tra `src/i18n/en/*.ts` theo đúng chuỗi gốc (sửa chữ Việt thì sửa khoá dịch). Không gọi `t()` ở cấp module — nhãn khai sẵn ghi `// i18n-key` rồi gọi `t(nhãn)` lúc vẽ.
- Chữ do dữ liệu mẫu hay thuật toán sinh ra đi qua `tx()`; câu cảnh báo của `plan.ts` dịch bằng `EN_RULES` trong `src/i18n/en.ts` (đổi câu thì sửa luật dịch). Dữ liệu lưu không chứa chữ đã dịch; ô sửa tên hiện `tx(tên)` và lưu qua `untx(chữ, gốc)`.
- Chữ tiếng Việt cố ý để trần (tiêu đề cột file Excel mẫu…) ghi `// i18n-ok`. `npm test` chạy `scripts/check-i18n.mjs`; `scripts/ui-lang.mjs` soát giao diện tiếng Anh.

## Thuật toán xếp (`src/engine/`)

Chi tiết từng luật (1–25), ngưỡng và số đo: `docs/notes/thuat-toan.md`.

- `loadPlan.ts` là bản chép nguyên lõi xếp của SUPPLYC. Không sửa lõi ở đây: luật xếp mới viết ở SUPPLYC trước (hỏi chủ dự án trước khi đổi SUPPLYC), rồi chép file sang và chạy `npm test`. Lý do: luật xếp phải sống ở một nơi gốc, hai app không trôi lệch.
- `plan.ts` chỉ ghép dữ liệu người dùng và sinh cảnh báo, không giữ luật xếp riêng. Tính năng chọn hàng cho từng xe như "Chia ra nhiều xe" (`split.ts`) không phải luật xếp nên làm ở MalCargo được.
- Thuật toán phải tự tìm phương án tối ưu (thử nhiều cách, chấm điểm, lấy cách tốt nhất), không gài sẵn một kiểu xếp cho từng cỡ xe. Con số thực tế chủ dự án đưa ("xe 9,6 m chở 17 pallet") là mốc kiểm trong test, không phải luật.
- Nguyên tắc nghiệp vụ đang hiệu lực (xe xá): xếp bằng mặt, một chân một loại hàng (ngoại lệ: hàng nhẹ trên nóc, chỗ tiếp giáp hai đơn); khối cao thấp dần ra cửa; đơn giao trước xếp sau cùng, sát cửa; hàng nhẹ gom một khối liền trên nóc (công tắc "Hàng nhẹ: xếp riêng" để đứng sàn); mỗi hàng ngang một hướng thùng; hở vách tối đa 10 cm; trải sàn theo % tải, tải từ 85% trở lên thì tới sát cửa; chồng theo "Chồng khi xếp xá" của mã, trống thì như pallet.
- Xe pallet: mọi hàng nằm gọn trên pallet của nó; pallet chẵn theo quy cách, phần lẻ mỗi mã một pallet rồi dồn pallet gộp, chia theo chiều cao xếp thật và không vượt trần (tính cả đế); lớp phẳng phủ kín, cột cùng mã không quá số lớp; xếp sàn theo làn, nhiều pallet nhất, khoảng cách giữa pallet theo cài đặt. Mã chưa khai thùng/pallet thì ước theo cỡ thùng; thùng không nằm được trên chân pallet thì báo lỗi.
- Gợi ý xe: xe cùng kiểu nhỏ nhất chở hết và không vượt tải, xét xe của người dùng / Family trước, chỉ trong cùng dòng xe (`pickPool`).
- Tính trong Web Worker (`worker.ts`, `useTripPlan.ts`); đổi cấu hình lúc đang tính thì huỷ lượt dở. Hàm nặng của lõi không được chạy trên luồng chính lúc vẽ giao diện (đưa vào worker hoặc nhớ kết quả) — đã từng làm đổi xe khoá màn vài giây. `levelFill` phải là hàm thuần: thêm đầu vào mới thì thêm vào `fillKey`.
- Không import `three` vào file nằm ngoài `src/three/` trừ qua `LazyScene` (kéo ~550 KB vào gói chính).
- Hai chuyến mẫu (`sample-t1` Mẫu pallet, `sample-t2` Mẫu 40ft) được `npm test` giữ kết quả (Mẫu pallet đủ 17 pallet, Mẫu 40ft trên 90% tải, hàng nhẹ gom đầu xe, tới sát cửa). Bộ mã Mẫu chung đổi thì dựng lại đơn mẫu và thêm đời đang chạy vào `PREV_SAMPLES`.

## Đồ hoạ 3D (`src/three/`)

Chi tiết: `docs/notes/do-hoa-3d-va-man.md`.

- Xe dựng bằng code theo lòng thùng khai (`truckModel.ts`), có dòng container riêng; mặt cắt theo phía người xem. Hệ trục ba chiều: X dọc xe (0 = vách đầu thùng), Y lên, Z ngang; thuật toán dùng x dọc, y ngang, z cao — đổi trục khi vẽ.
- Hàng (`cargo.ts`): thùng in theo mã (`cartonFaces`), pallet gỗ đúng cỡ chân với từng thùng thật trên đó. Màu cố định theo mã (`itemColors`), không theo thứ tự xếp.
- Nhãn số lớp theo vùng (`layerBadges.ts`, `marks.ts`), cùng kiểu với SUPPLYC; đếm theo từng mã, hàng nhẹ trên nóc ghi "+n lớp".
- Ảnh canvas nhớ theo khoá (`textures.ts`); bản chạy thật tắt kiểm lỗi shader; lúc rảnh dịch sẵn shader kiểu xe còn lại — để đổi xe không giật.
- Camera căn theo khối cầu bao xe (`goTo`, `fitFov`); chỉ căn lại khi xe khác cỡ.

## Dữ liệu và máy chủ

Chi tiết: `docs/notes/cai-app-du-lieu.md`.

- Trên máy: zustand + localStorage (`src/data/store.ts`); mỗi bộ dữ liệu ("Của tôi", từng Family) lưu riêng. Muốn giữ dữ liệu / đổi máy thì đăng nhập Google — không có sao lưu file.
- Chuyến mẫu luôn nguyên gốc: sửa gì cũng tách thành chuyến mới (`makeFork`) mà màn không dựng lại (đang gõ không mất con trỏ). So "mẫu còn nguyên" theo nội dung (`linesKey`), không so chuỗi JSON.
- Nháp trống tự dọn (`sweepBlank`); mọi lần xoá ghi dấu đã xoá `deleted` (90 ngày) để gộp nhiều máy không làm thứ đã xoá sống lại.
- Đồng bộ từng bản ghi: app gửi chỉ phần đổi (`user_sync` / `family_sync`), máy chủ gộp theo cùng luật `mergeBackup` (sửa sau thắng, dấu xoá muộn nhất). Đổi luật gộp thì sửa cả hai nơi.
- Family: chủ (và quản lý) giữ danh mục mã hàng, xe, cỡ pallet; thành viên làm đơn và chuyến; người chỉ xem không sửa được (`readOnly()`). Ba công tắc ẩn dữ liệu mẫu (đơn mẫu, mã hàng mẫu chung, xe mẫu chung) qua `useHidden` — chỉ giấu, không xoá, mã / xe đơn đang dùng vẫn đọc được.
- Nhập Excel (`src/data/importer.ts`): mỗi loại một file mẫu một trang, kiểm chặt — còn một lỗi là không nhập gì, tiêu đề cột phải đúng mẫu, số theo khoảng; file mẫu có ràng buộc ô cùng luật với lúc nạp. `scripts/check-import.mjs` giữ các luật này.
- `src/data/catalog.ts` và `supabase/schema.sql` là bản mặc định của Mẫu chung: giữ hai nơi khớp nhau và khớp bảng `catalog` thật. Người thường sửa mẫu thì thành bản "của tôi".
- `supabase/schema.sql` phải chạy lại được. Đổi máy chủ: viết phần thêm (`scripts/out/*-delta.sql`) + bài thử trong giao dịch tự huỷ, thử cả khi cố ý làm hỏng hàm, rồi hỏi trước khi áp. App đọc cột mới thì đọc kiểu không phụ thuộc thứ tự áp (`select('*')`) hoặc áp SQL trước khi đẩy app.
- `public/privacy.html` phải đúng với những gì app thu và cho người khác xem; đổi phần đó thì sửa trang này trước. Màn Quản trị chỉ đếm số, không trả nội dung đơn.
- Tài khoản: đăng xuất chỉ máy này; dữ liệu trên máy gắn với tài khoản đang đăng nhập (`malcargo-owner-v1`) để không gộp nhầm sang tài khoản khác.

## Cài như app

- Service worker (`src/sw.js`, plugin `offline` trong `vite.config.ts`) cho app mở được khi mất mạng; script kiểm không đăng ký trừ khi đặt `malcargo-sw-test`.
- `ui/Crash.tsx` bọc app và khung 3D để lỗi không làm trắng màn; `ui/errors.ts` tự tải lại khi bản cũ thiếu file sau khi lên bản mới.
- APK là Trusted Web Activity mở cargo.mal.com.vn: cập nhật web là app có bản mới, chỉ build lại APK khi đổi vỏ (tên, biểu tượng, tên miền). `public/.well-known/assetlinks.json` chứa dấu khoá ký — sai thì app hiện thanh địa chỉ. Khoá ký và dự án Android không nằm trong repo.

## Kiểm trước khi báo xong

```bash
npm test            # thuật toán, kho dữ liệu, nhập Excel, bản dịch
npm run check:ui    # build + các script scripts/ui-*.mjs: chụp màn, luồng người mới, Family, bàn phím, in phiếu, offline, chia xe, nút chạm được, cuộn, tiếng Anh, chữ bị cắt
```

- Ảnh ra `scripts/out/` — mở xem bằng mắt.
- Script kiểm không bấm link ra ngoài (Zalo, email, mal.com.vn): `mailto:` từng mở Outlook thật trên máy.
- Thêm màn / tấm mới thì thêm vào `STATES` (`scripts/ui-states.mjs`) để ui-tap, ui-scroll, ui-lang soát.
- Chạy song song hai lượt kiểm thì build ra thư mục riêng và đặt `UI_DIST` để không giẫm lên `dist/` của nhau.
