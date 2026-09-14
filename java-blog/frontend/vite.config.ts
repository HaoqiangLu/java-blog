import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),        // React JSX 转换 + Fast Refresh
    tailwindcss(),  // TailwindCSS 4 原子类编译
  ],
  server: {
    port: 5173,     // 开发服务器端口
    proxy: {
      '/api': {
        target: 'http://localhost:8080',  // Spring Boot 后端地址
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
  },
})