// Biểu tượng app (PWA + APK): logo MAL nghiêng đậm + nhãn CARGO xanh trên nền navy — vẽ bằng trình duyệt với font
// Be Vietnam Pro đã lưu trong node_modules, xuất PNG vào public/icons/. Đổi logo ⇒ chạy lại: node scripts/make-icons.mjs
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch } from './ui-lib.mjs'

const font = w => readFileSync(join('node_modules/@fontsource/be-vietnam-pro/files', `be-vietnam-pro-latin-${w}.woff2`)).toString('base64')
const OUT = join('public', 'icons')
mkdirSync(OUT, { recursive: true })

// `scale`: phần logo chiếm bao nhiêu bề ngang — maskable phải nằm gọn trong vòng an toàn (80% giữa) vì máy cắt tròn / bo góc
const page = (size, scale) => `<!doctype html><html><head><style>
@font-face { font-family: B; font-weight: 800; font-style: italic; src: url(data:font/woff2;base64,${font('800-italic')}) }
@font-face { font-family: B; font-weight: 700; font-style: normal; src: url(data:font/woff2;base64,${font('700-normal')}) }
html, body { margin: 0; background: transparent }
.box { width: ${size}px; height: ${size}px; background: #0b1424; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: ${0.05 * size * scale}px; font-family: B }
.mal { color: #fff; font-weight: 800; font-style: italic; font-size: ${0.44 * size * scale}px; letter-spacing: -0.04em; line-height: 1; padding-right: 0.06em }
.cargo { background: #1a66ff; color: #fff; font-weight: 700; font-size: ${0.15 * size * scale}px; letter-spacing: 0.1em;
  padding: ${0.03 * size * scale}px ${0.06 * size * scale}px; border-radius: ${0.025 * size * scale}px; line-height: 1 }
</style></head><body><div class="box"><span class="mal">MAL</span><span class="cargo">CARGO</span></div></body></html>`

const ICONS = [
  ['icon-192.png', 192, 0.84],
  ['icon-512.png', 512, 0.84],
  ['icon-maskable-512.png', 512, 0.62],
  ['apple-touch-icon.png', 180, 0.84],
]
const b = await launch()
const p = await b.newPage()
for (const [name, size, scale] of ICONS) {
  await p.setViewportSize({ width: size, height: size })
  await p.setContent(page(size, scale))
  await p.evaluate(() => document.fonts.ready)
  await p.locator('.box').screenshot({ path: join(OUT, name), omitBackground: true })
  console.log(join(OUT, name))
}
await b.close()
