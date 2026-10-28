// Bảng dịch tiếng Anh — khu vực sheets. Khoá = chuỗi gốc tiếng Việt trong t() (đúng từng ký tự).
// Khoá đã có ở pages.ts / trip.ts (Mã hàng, Xe, Lưu, Mẫu chung, Rộng, Cao, Biển số…) không chép lại.
export const SHEETS: Record<string, string> = {
  // ── dùng chung form mã hàng / xe ──
  'Không lưu được mẫu chung: {e}': 'Could not save to shared: {e}',
  'Không xoá được: {e}': 'Could not delete: {e}',
  'Lưu mẫu chung: mọi người dùng thấy ngay.': 'Save to shared: all users see it at once.',
  'Lưu thành của tôi': 'Save as mine',
  'Đang lưu…': 'Saving…',
  'Lưu mẫu chung': 'Save to shared',
  'Dài': 'Length',

  // ── form mã hàng ──
  'Nhập mã hàng': 'Enter a code',
  'Nhập tên hàng': 'Enter an item name',
  'Nhập đủ dài, rộng, cao của thùng': 'Enter the carton length, width and height',
  'Mã mẫu: {name}': 'Sample item: {name}',
  'Thêm mã mẫu chung': 'Add shared item',
  'Sửa mã hàng': 'Edit item',
  'Sửa rồi bấm Lưu, mã thành của bạn. Mẫu chung giữ nguyên.': 'Edit and tap Save to make it your own item. The shared one stays as is.',
  'Kích thước tính bằng milimét (mm)': 'Sizes in millimetres (mm)',
  'Xoá mã mẫu': 'Delete sample item',
  'Xoá mã': 'Delete item',
  'Lưu thành mã của tôi': 'Save as my item',
  'Sữa 110ml x48': 'Milk 110ml x48',
  'Kích thước thùng (mm) — dài × rộng × cao': 'Carton size (mm) — length × width × height',
  'Số khá nhỏ — có phải bạn đang nhập cm? Ô này tính bằng mm (40 cm = 400 mm).':
    'These numbers are small — did you enter cm? This field is in mm (40 cm = 400 mm).',
  'Đo mặt ngoài thùng. Thùng đứng đúng chiều mũi tên thì "cao" là chiều đứng.':
    'Measure the outside of the carton. With the arrows pointing up, "height" is the upright side.',
  'Để trống nếu chưa biết': 'Leave blank if unknown',
  'Chồng tối đa': 'Max stack',
  'Trống = theo chiều cao xe': 'Blank = up to truck height',
  'lớp': 'layers',
  'Tự động': 'Auto',
  'Số thùng trên 1 pallet': 'Cartons per pallet',
  'Chỉ cần khi chở bằng xe pallet': 'Only needed for pallet trucks',
  'thùng': 'cartons',
  'Hàng nhẹ — cho lên trên hàng khác': 'Light goods — can go on top of other goods',
  'Túi, hộp giấy nhẹ… được xếp lên mặt các khối hàng nặng': 'Bags, light paper boxes… are stacked on top of heavier goods',
  'Mẫu gốc: thùng {dims} mm, số tham khảo, nên đo lại thùng thật.':
    'Original sample: carton {dims} mm. Reference figures, best to measure your real carton.',
  'Sửa số rồi Lưu: app tạo mã của bạn, thay vào đơn của chuyến này.':
    "Edit and Save: the app makes it your own item and uses it in this trip's order.",
  'Sửa ở đây là sửa cho mọi đơn dùng mã này.': 'Changes here apply to every order using this item.',
  'Bỏ khỏi đơn': 'Remove from order',
  'Xoá mã mẫu {code}?': 'Delete sample item {code}?',
  'Xoá mã {code}?': 'Delete item {code}?',
  'Mã mẫu biến mất khỏi danh sách của MỌI người dùng; đơn nào đang dùng sẽ báo thiếu mã.':
    'The sample item disappears for ALL users; orders using it will show a missing item.',
  'Mã này đang có trong {n} đơn — các dòng đó sẽ báo thiếu mã.':
    'This item is in {n} {n:order|orders} — those lines will show a missing item.',

  // ── form xe ──
  'Đặt tên hoặc nhập biển số': 'Enter a name or a plate',
  'Lòng thùng: dài 0,5–20 m, rộng ≤ 3,5 m, cao ≤ 4,5 m (nhập mm)': 'Cargo box: length 0.5–20 m, width ≤ 3.5 m, height ≤ 4.5 m (enter mm)',
  'Xe mẫu: {name}': 'Sample truck: {name}',
  'Thêm xe mẫu chung': 'Add shared truck',
  'Sửa xe': 'Edit truck',
  'Sửa rồi bấm Lưu, xe thành của bạn. Mẫu chung giữ nguyên.': 'Edit and tap Save to make it your own truck. The shared one stays as is.',
  'Đo LÒNG thùng (bên trong), tính bằng mm': 'Measure the INSIDE of the cargo box, in mm',
  'Xoá xe mẫu': 'Delete sample truck',
  'Xoá xe': 'Delete truck',
  'Lưu thành xe của tôi': 'Save as my truck',
  'Nhập lòng thùng để xem trước xe': 'Enter the cargo box size to preview the truck',
  'chỗ pallet trên sàn': 'pallet spots on the floor',
  'Tên xe': 'Truck name',
  'Xe 5 tấn số 1': '5-ton truck 1',
  'Lòng thùng (mm) — dài × rộng × cao': 'Cargo box (mm) — length × width × height',
  'Tải trọng cho phép': 'Payload',
  'Để trống thì không kiểm vượt tải': 'Leave blank to skip the overload check',
  'Xoá xe mẫu {name}?': 'Delete sample truck {name}?',
  'Xe mẫu biến mất khỏi danh sách của MỌI người dùng. Chuyến đang dùng xe này phải chọn xe khác.':
    'The sample truck disappears for ALL users. Trips using it must pick another truck.',
  'Chuyến đang dùng xe này sẽ phải chọn xe khác.': 'Trips using this truck will need another truck.',

  // ── chọn mã hàng cho đơn ──
  'Bấm để thêm vào đơn — bấm lại để bỏ': 'Tap to add to the order — tap again to remove',
  'Mã mới': 'New item',
  'Xong': 'Done',
  '{n} mã': '{n} {n:item|items}',
  'Tìm mã hoặc tên': 'Search code or name',
  'Không có mã nào khớp — bấm “Mã mới” để thêm.': 'No matching items — tap “New item” to add one.',

  // ── nhập từ Excel (màn) ──
  '{n} mã hàng': '{n} {n:item|items}',
  '{n} đơn hàng': '{n} {n:order|orders}',
  'Không đọc được file. Hãy dùng file .xlsx tải từ nút "Tải file mẫu".': 'Cannot read the file. Use the .xlsx from the "Download template" button.',
  'Đã nhập {list}': 'Imported {list}',
  'Mã hàng · Xe · Đơn hàng · Chuyến, trong một file mẫu': 'Items · Trucks · Orders · Trips, in one template',
  'Nhập {n} dòng dữ liệu': 'Import {n} {n:row|rows}',
  'Chưa có gì để nhập': 'Nothing to import yet',
  'Tải file mẫu': 'Download the template',
  '4 trang Mã hàng, Xe, Đơn hàng, Chuyến. Mỗi trang có tiêu đề cột (dấu * là bắt buộc) và dòng ví dụ.':
    '4 sheets: items, trucks, orders, trips. Each has column headers in Vietnamese (* = required) and example rows.',
  'Không tạo được file mẫu.': 'Could not create the template.',
  'Tải file mẫu .xlsx': 'Download template .xlsx',
  'Điền xong thì nạp cả file': 'Fill it in, then load the whole file',
  'App đọc đủ 4 trang một lần. Trang nào để trống thì bỏ qua.': 'The app reads all 4 sheets at once. Empty sheets are skipped.',
  'Bỏ file': 'Remove file',
  'Nạp file .xlsx': 'Load .xlsx file',
  'Hoặc chép từng bảng trong Excel rồi dán vào đây:': 'Or copy each table in Excel and paste it here:',
  'Dán bảng {name}': 'Paste the {name} table',
  '{n} dòng trùng với dữ liệu đã có sẽ được cập nhật.': '{n} {n:row matches|rows match} existing data and will be updated.',
  '… và {n} dòng khác': '… and {n} more',

  // ── nhập từ Excel: tiêu đề cột (hiện trên màn; trong file vẫn tiếng Việt) ──
  'Dài (mm)': 'Length (mm)',
  'Rộng (mm)': 'Width (mm)',
  'Cao (mm)': 'Height (mm)',
  'Kg/thùng': 'Kg/carton',
  'Chồng tối đa (lớp)': 'Max stack (layers)',
  'Hàng nhẹ (x)': 'Light goods (x)',
  'Cách chở (Thùng rời / Pallet)': 'Loading mode (Loose / Pallet)',
  'Dài lòng thùng (mm)': 'Cargo box length (mm)',
  'Tải trọng (kg)': 'Payload (kg)',
  'Xe (tên hoặc biển số)': 'Truck (name or plate)',

  // ── nhập từ Excel: ghi chú từng trang (màn + trang Hướng dẫn trong file) ──
  'Kích thước THÙNG, đo mặt ngoài, tính mm. Hàng nhẹ ghi x. Mã trùng mã đã có ⇒ cập nhật.':
    'CARTON size, measured outside, in mm. Light goods: put x. A code that already exists ⇒ updated.',
  'Đo LÒNG thùng (bên trong), tính mm. Cách chở bỏ trống = Thùng rời. Biển số (hoặc tên) trùng xe đã có ⇒ cập nhật.':
    'Measure the INSIDE of the cargo box, in mm. Blank loading mode = loose cartons. A plate (or name) that already exists ⇒ updated.',
  'Mỗi dòng một mã hàng; đơn nhiều mã thì lặp lại tên đơn. Mã hàng lấy ở trang Mã hàng hoặc mã đã có trong app.':
    'One item per row; repeat the order name for more items. Use codes from the items sheet or items already in the app.',
  'Mỗi dòng một đơn, ghi theo THỨ TỰ GIAO: đơn giao trước ghi trước (được xếp sát cửa).':
    'One order per row, in DELIVERY ORDER: first delivery first (loaded nearest the door).',

  // ── nhập từ Excel: lỗi từng dòng ──
  '{sheet}, dòng {line}: {msg}': '{sheet}, row {line}: {msg}',
  'thiếu mã hoặc tên': 'missing code or name',
  '{code}: thiếu kích thước dài × rộng × cao': '{code}: missing length × width × height',
  'thiếu tên xe': 'missing truck name',
  '{name}: lòng thùng phải nhập mm (dài, rộng, cao ≥ 500)': '{name}: enter the cargo box in mm (length, width, height ≥ 500)',
  'thiếu tên đơn hoặc mã hàng': 'missing order name or item code',
  'không thấy mã hàng "{code}"': 'item code "{code}" not found',
  '{code}: số thùng phải lớn hơn 0': '{code}: cartons must be more than 0',
  'thiếu tên chuyến hoặc tên đơn': 'missing trip name or order name',
  'không thấy đơn "{name}"': 'order "{name}" not found',
  'không thấy xe "{name}" (chuyến vẫn nhập, chưa gán xe)': 'truck "{name}" not found (trip imported without a truck)',

  // ── file mẫu .xlsx: trang Hướng dẫn + tên file (tên 4 trang dữ liệu, tiêu đề cột giữ tiếng Việt) ──
  'MalCargo — file mẫu nhập dữ liệu': 'MalCargo — data import template',
  'Điền các trang Mã hàng, Xe, Đơn hàng, Chuyến (trang nào không cần thì để trống), rồi trong app chọn Menu → Nhập từ Excel → Nạp file.':
    'Fill in the sheets Mã hàng (items), Xe (trucks), Đơn hàng (orders), Chuyến (trips); leave any you do not need empty. Then in the app choose Menu → Import from Excel → Load .xlsx file.',
  'Cột có dấu * là bắt buộc. Xoá các dòng ví dụ trước khi nạp. Giữ nguyên dòng tiêu đề.':
    'Columns marked * are required. Delete the example rows before loading. Keep the sheet names and header rows as they are (in Vietnamese).',
  'Hướng dẫn': 'Guide',
  'malcargo-mau-nhap-du-lieu.xlsx': 'malcargo-import-template.xlsx',

  // ── dòng ví dụ file mẫu (dữ liệu, dịch bằng tx() — các tên mẫu khác đã có ở EN_NAMES) ──
  'Đơn 101': 'Order 101',
  'Đơn 102': 'Order 102',
  'Chuyến sáng 28/10': 'Morning trip 28/10',
  // Diễn giải từng mã (28/10)
  'Dòng xe': 'Vehicle type',
  'Container không được tự chọn — chỉ dùng khi bạn chọn': 'Containers are never picked automatically — only when you choose one',
  'Xe tải': 'Truck',
  'Container': 'Container',
}
