// three.js nặng ~600KB — chỉ tải khi màn có 3D mở ra.
import { lazy, Suspense } from 'react'
import type { TruckSceneProps } from './TruckScene'
import { t } from '../i18n'
import { Crash } from '../ui/Crash'

const Inner = lazy(() => import('./TruckScene'))

export default function Scene(p: TruckSceneProps) {
  return (
    // máy không vẽ được WebGL / lỗi trong cảnh 3D ⇒ báo trong khung, phần còn lại của màn vẫn dùng được
    <Crash where="3d" small>
    <Suspense fallback={<div className={`${p.className ?? ''} grid place-items-center bg-[#e7ecf2] text-sm text-slate-600`}>{t('Đang dựng xe…')}</div>}>
      <Inner {...p} />
    </Suspense>
    </Crash>
  )
}
