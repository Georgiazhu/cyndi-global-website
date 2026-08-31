import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        // 首页 = Cyndi 官网页（hero + 导航）
        index: 'index.html',
        // 商城页（商品/购物车/搜索）
        shop: 'shop.html',
      },
    },
  },
  server: {
    // 把 /api 请求转发到带后端的 wrangler(8788)，这样 5173 也能登录/下单
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
    },
  },
})
