import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Sau khi build: ghi `dist/sw.js` kèm danh sách file của bản build (JS, CSS, font woff2, biểu tượng) để app mở được khi mất mạng.
 *  Tên bộ nhớ đệm = băm danh sách ⇒ bản mới tự thay bộ cũ. */
function offline(): Plugin {
  let out = 'dist'
  return {
    name: 'offline-sw', apply: 'build',
    configResolved(c) { out = c.build.outDir },
    closeBundle() {
      let assets: string[]
      try { assets = readdirSync(join(out, 'assets')) } catch { return }   // lượt build của worker không có thư mục assets
      const files = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png',
        ...assets.filter(f => /\.(js|css|woff2)$/.test(f)).map(f => `/assets/${f}`)]
      // giờ build (base36, tăng dần) đứng trước ⇒ service worker biết bộ nào mới hơn
      const ver = Date.now().toString(36) + '-' + createHash('sha1').update(files.join('|') + readFileSync(join(out, 'index.html'), 'utf8')).digest('hex').slice(0, 10)
      writeFileSync(join(out, 'sw.js'), readFileSync(fileURLToPath(new URL('./src/sw.js', import.meta.url)), 'utf8')
        .replace("'__VER__'", JSON.stringify(ver)).replace("'__FILES__'", JSON.stringify(files)))
    },
  }
}

export default defineConfig({
  plugins: [react(), offline()],
  define: { __APP_VER__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? new Date().toISOString().slice(0, 16)) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  worker: { format: 'es' },
  build: {
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
})
