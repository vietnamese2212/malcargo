// Lưu file ra máy: trình duyệt có hộp "Lưu thành…" (Chrome / Edge trên máy tính) ⇒ người dùng chọn thư mục, đổi tên;
// không có (Safari, Firefox, điện thoại) ⇒ tải về thư mục mặc định như thường.
// Hộp phải mở NGAY trong cú bấm (dựng file xong mới mở thì trình duyệt có thể chặn) ⇒ mở hộp trước, dựng file sau.
type Writable = { write: (b: Blob) => Promise<void>; close: () => Promise<void> }
type SaveHandle = { createWritable: () => Promise<Writable> }
type SavePicker = (o: { suggestedName: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<SaveHandle>

const TYPES: Record<string, [string, string]> = {
  '.xlsx': ['Excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.json': ['JSON', 'application/json'],
  '.png': ['PNG', 'image/png'],
}

/** `make` dựng nội dung file — gọi SAU khi người dùng chọn chỗ lưu. Trả về false khi người dùng bấm Huỷ. */
export async function saveFile(name: string, make: () => Blob | Promise<Blob>): Promise<boolean> {
  const pick = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker
  let handle: SaveHandle | null = null
  if (pick) {
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase(), type = TYPES[ext]
    try { handle = await pick({ suggestedName: name, types: type && [{ description: type[0], accept: { [type[1]]: [ext] } }] }) }
    catch (e) { if ((e as Error).name === 'AbortError') return false }   // lỗi khác (khung nhúng, hết hạn cú bấm…) ⇒ tải về như thường
  }
  const blob = await make()
  if (handle) {
    const w = await handle.createWritable()
    await w.write(blob); await w.close()
    return true
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  return true
}
