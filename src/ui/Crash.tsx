// Màn gặp lỗi khi vẽ: thay vì trắng màn, báo ngắn + Tải lại. Dữ liệu vẫn nằm trên máy (localStorage) — không mất gì.
import { Component, type ReactNode } from 'react'
import { RotateCw } from 'lucide-react'
import { report, reloadForNewVersion } from './errors'
import { t } from '../i18n'

export class Crash extends Component<{ children: ReactNode; where?: string; small?: boolean }, { err: Error | null }> {
  state: { err: Error | null } = { err: null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(err: Error) { if (!reloadForNewVersion(err)) report(err, this.props.where) }
  render() {
    if (!this.state.err) return this.props.children
    // khung nhỏ (3D): báo tại chỗ, phần còn lại của màn vẫn dùng được
    if (this.props.small) return (
      <div className="grid h-full min-h-[200px] w-full place-items-center bg-[#e7ecf2] p-4 text-center">
        <div>
          <p className="text-sm font-semibold text-slate-800">{t('Không vẽ được hình 3D trên máy này')}</p>
          <p className="mt-1 text-[13px] text-slate-600">{t('Bảng đếm chân và số liệu bên dưới vẫn dùng được.')}</p>
          <button onClick={() => this.setState({ err: null })} className="tap mt-3 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            <RotateCw size={16} />{t('Thử lại')}
          </button>
        </div>
      </div>
    )
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-slate-100 p-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-lg font-bold text-slate-900">{t('App gặp lỗi khi hiện màn này')}</h1>
          <p className="mt-2 text-sm text-slate-600">{t('Dữ liệu của bạn vẫn còn trên máy. Lỗi đã được ghi lại để sửa.')}</p>
          <div className="mt-5 flex flex-col gap-2">
            <button onClick={() => location.reload()} className="tap inline-flex items-center justify-center gap-2 rounded-md bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600">
              <RotateCw size={16} />{t('Tải lại')}
            </button>
            <button onClick={() => { location.hash = '#/'; location.reload() }} className="tap rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              {t('Về Bàn xếp xe')}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
