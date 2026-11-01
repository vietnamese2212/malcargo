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

catchShareLink()   // mở bằng link chia sẻ …/s/<mã> ⇒ ghi nhận mã, địa chỉ về trang gốc (trước khi đăng nhập đọc địa chỉ)
initCloud()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
