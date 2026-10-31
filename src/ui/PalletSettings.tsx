// Cài đặt PALLET — một cỡ dùng chung cho mọi xe pallet. Mở bằng nút ⚙ ngay cạnh nút chọn "Pallet" trên bàn xếp xe
// (chủ dự án 29/10: "setting pallet nằm ở chỗ nào — đưa vào gần lựa chọn pallet"); bảng Thùng xe và trang Tài khoản
// dùng cùng khối ô này. Cao tối đa TÍNH CẢ ĐẾ pallet.
import { useData } from '../data/store'
import { DEFAULT_PALLET_SETTINGS } from '../data/catalog'
import type { PalletSettings } from '../data/types'
import { Button, LiveNum, Sheet, cx } from './kit'
import { t } from '../i18n'

export function PalletFields({ cols = 'grid-cols-2 sm:grid-cols-3' }: { cols?: string }) {
  const p = useData(s => s.pallet)
  // ghép vào cài đặt MỚI NHẤT (sửa hai ô liền tay không ghi đè nhau)
  const set = (patch: Partial<PalletSettings>) => useData.getState().setPallet({ ...useData.getState().pallet, ...patch })
  return (
    <>
      <div className={cx('grid gap-3', cols)}>
        <LiveNum label={t('Dài chân')} value={p.l} valid={n => n >= 400 && n <= 2000} suffix="mm" onCommit={v => v && set({ l: v })} />
        <LiveNum label={t('Rộng chân')} value={p.w} valid={n => n >= 400 && n <= 2000} suffix="mm" onCommit={v => v && set({ w: v })} />
        <LiveNum label={t('Cao tối đa (cả đế)')} value={p.maxH} valid={n => n >= 500 && n <= 3000} suffix="mm" onCommit={v => v && set({ maxH: v })} />
        <LiveNum label={t('Cao đế pallet')} value={p.baseH} valid={n => n >= 50 && n <= 300} suffix="mm" onCommit={v => v && set({ baseH: v })} />
        <LiveNum label={t('Nặng pallet rỗng')} value={p.kg} valid={n => n >= 0 && n <= 100} suffix="kg" onCommit={v => v != null && set({ kg: v })} />
      </div>
      <p className="mt-2 text-[12px] leading-snug text-slate-600">{t('Cao tối đa chỉ áp cho pallet gộp hàng lẻ; pallet chẵn cao theo quy cách từng mã.')}</p>
      <button type="button" className="tap mt-1 text-[13px] font-medium text-brand-700 hover:text-brand-600" onClick={() => useData.getState().setPallet(DEFAULT_PALLET_SETTINGS)}>
        {t('Về mặc định 1200 × 1000')}
      </button>
    </>
  )
}

export function PalletSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={t('Cài đặt pallet')} subtitle={t('dùng cho mọi xe pallet')}
      footer={<Button variant="primary" className="w-full" onClick={onClose}>{t('Xong')}</Button>}>
      <PalletFields />
    </Sheet>
  )
}
