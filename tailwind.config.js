/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'] },
      colors: {
        navy: { 950: '#0b1424', 900: '#111c30', 800: '#1a2740', 700: '#26365a' },
        brand: { 50: '#eef4ff', 100: '#dbe7ff', 200: '#b7cfff', 500: '#1a66ff', 600: '#0f55e0', 700: '#0c45b8' },
        // canvas: xám ngả về sắc xanh thương hiệu — thẻ trắng nổi lên trên (khuôn Manhattan)
        canvas: '#eef2f7',
      },
      boxShadow: {
        // chỉ thứ NỔI mới có bóng (tấm trượt, hộp xác nhận, thông báo) — thẻ nằm yên thì không
        pop: '0 12px 32px -8px rgba(11,20,36,.25), 0 2px 6px rgba(11,20,36,.08)',
      },
    },
  },
  plugins: [],
}
