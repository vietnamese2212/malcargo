// Dùng chung cho các script kiểm giao diện: tự mở bản build (dist/) và trình duyệt Chromium của Playwright.
// Chỉ đọc + chụp + bấm trong app — KHÔNG bấm link ra ngoài (mailto/zalo mở app thật trên máy).
import { preview } from 'vite'
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

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

export async function launch() {
  // camera giả: phòng khi màn nào đó xin camera, không bao giờ mở webcam thật của máy
  return chromium.launch({ executablePath: chromePath(), args: ['--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
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
