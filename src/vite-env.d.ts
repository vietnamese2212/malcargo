/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

/** Bản app (mã commit lúc build trên Vercel, không thì giờ build) — gửi kèm báo lỗi. */
declare const __APP_VER__: string
