// Nút ngôn ngữ cạnh Login (thanh trên navy): hiện ngôn ngữ đang dùng, bấm một lần là đổi sang ngôn ngữ kia — nhớ trên máy.
import { Languages } from 'lucide-react'
import { t, useLang } from '../i18n'

export function LangSwitch() {
  const lang = useLang(s => s.lang)
  const setLang = useLang(s => s.setLang)
  const label = lang === 'en' ? t('Đổi sang tiếng Việt') : t('Đổi sang tiếng Anh')
  return (
    <button type="button" onClick={() => setLang(lang === 'en' ? 'vi' : 'en')} aria-label={label} title={label}
      className="flex h-9 items-center gap-1.5 rounded-md border border-white/30 px-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 max-sm:px-1.5 sm:px-2.5">
      <Languages size={16} strokeWidth={1.75} className="max-sm:hidden" />{lang === 'en' ? 'EN' : 'VI'}
    </button>
  )
}
