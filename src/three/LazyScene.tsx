// three.js nặng ~600KB — chỉ tải khi màn có 3D mở ra.
import { lazy, Suspense } from 'react'
import type { TruckSceneProps } from './TruckScene'
import { t } from '../i18n'

const Inner = lazy(() => import('./TruckScene'))

export default function Scene(p: TruckSceneProps) {
  return (
    <Suspense fallback={<div className={`${p.className ?? ''} grid place-items-center bg-[#e7ecf2] text-sm text-slate-600`}>{t('Đang dựng xe…')}</div>}>
      <Inner {...p} />
    </Suspense>
  )
}
