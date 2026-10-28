// Dùng chung cho các script kiểm giao diện: tự mở bản build (dist/) và trình duyệt Chromium của Playwright.
// Chỉ đọc + chụp + bấm trong app — KHÔNG bấm link ra ngoài (mailto/zalo mở app thật trên máy).
import { preview } from 'vite'
import { chromium } from 'playwright-core'
import { buildSync } from 'esbuild'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

export const OUT = join(process.cwd(), 'scripts', 'out')
mkdirSync(OUT, { recursive: true })

export async function startPreview(port = 4180) {
  if (!existsSync('dist/index.html')) throw new Error('Chưa có dist/ — chạy `npm run build` trước.')
  const server = await preview({ preview: { port, host: '127.0.0.1', strictPort: true }, logLevel: 'silent' })
  return { base: `http://127.0.0.1:${port}/`, close: () => new Promise(r => server.httpServer.close(r)) }
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
  const dirs = existsSync(root) ? readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1])) : []
  for (const d of dirs) {
    const exe = join(root, d, 'chrome-win64', 'chrome.exe')
    if (existsSync(exe)) return exe
  }
  throw new Error('Không thấy Chromium của Playwright — đặt biến CHROME_PATH.')
}

// Ngôn ngữ giao diện khi chụp / bấm thử: mặc định tiếng Việt (các script viết tên nút tiếng Việt);
// `--en` (hoặc MALCARGO_LANG=en) để soát bản tiếng Anh — app mặc định tiếng Anh, chọn lưu ở localStorage 'malcargo-lang-v1'.
export const UI_LANG = process.env.MALCARGO_LANG === 'en' || process.argv.includes('--en') ? 'en' : 'vi'

// Tên nút theo ngôn ngữ đang soát — dùng đúng bảng dịch của app: T('Đổi xe'), T('Sửa {name}', { name: TX('Sữa 180ml x48') })
const i18nDir = mkdtempSync(join(tmpdir(), 'malcargo-ui-i18n-'))
buildSync({ entryPoints: ['src/i18n/en.ts'], bundle: true, format: 'esm', platform: 'node', outfile: join(i18nDir, 'en.mjs'), logLevel: 'error' })
const I18N = await import(pathToFileURL(join(i18nDir, 'en.mjs')).href)
rmSync(i18nDir, { recursive: true, force: true })
const fillVars = (s, v) => (v ? s.replace(/\{(\w+):([^|}]*)\|([^}]*)\}/g, (m, k, one, many) => (k in v ? (Number(v[k]) === 1 ? one : many) : m)).replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s)
export const T = (vi, vars) => fillVars(UI_LANG === 'en' ? I18N.EN[vi] ?? vi : vi, vars)
export const TX = s => (UI_LANG === 'en' ? I18N.EN_NAMES[s] ?? I18N.EN[s] ?? s : s)
/** Đầu chuỗi đã dịch, bỏ phần biến — để dựng RegExp "bắt đầu bằng" cho nhãn có số liệu */
export const TP = vi => T(vi).split('{')[0]

export async function launch() {
  // camera giả: phòng khi màn nào đó xin camera, không bao giờ mở webcam thật của máy
  const b = await chromium.launch({ executablePath: chromePath(), args: ['--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
  const open = b.newContext.bind(b)
  b.newContext = async (...a) => {
    const ctx = await open(...a)
    await ctx.addInitScript(l => { try { localStorage.setItem('malcargo-lang-v1', JSON.stringify({ state: { lang: l }, version: 0 })) } catch {} }, UI_LANG)
    return ctx
  }
  return b
}

export const DEVICES = [
  { name: 'pc', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
]

export function watchErrors(page) {
  const errs = []
  page.on('pageerror', e => errs.push(String(e)))
  page.on('console', m => m.type() === 'error' && errs.push(m.text()))
  return errs
}
