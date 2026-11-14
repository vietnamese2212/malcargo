import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/be-vietnam-pro/400.css'
import '@fontsource/be-vietnam-pro/500.css'
import '@fontsource/be-vietnam-pro/600.css'
import '@fontsource/be-vietnam-pro/700.css'
import './index.css'
import App from './App'
import { initCloud } from './data/cloud'
import { catchShareLink } from './data/share'
import { catchFamilyLink } from './data/famlink'
import { watchErrors } from './ui/errors'
import { Crash } from './ui/Crash'

catchShareLink()   // mở bằng link chia sẻ …/s/<mã> ⇒ ghi nhận mã, địa chỉ về trang gốc (trước khi đăng nhập đọc địa chỉ)
catchFamilyLink()  // link Family …/f/<mã> (xem / xin vào)
initCloud()
watchErrors()   // lỗi ⇒ ghi về máy chủ; bản cũ thiếu file sau khi lên bản mới ⇒ tải lại

// chạy được khi mất mạng: service worker giữ bản app đã tải (src/sw.js). Script kiểm (webdriver) chỉ bật khi đặt khoá thử
if (import.meta.env.PROD && 'serviceWorker' in navigator && (!navigator.webdriver || localStorage.getItem('malcargo-sw-test')))
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* trình duyệt chặn: app vẫn chạy như cũ */ }) })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Crash where="app"><App /></Crash>
  </React.StrictMode>,
)
