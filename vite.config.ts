import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/CC-Balancer/',
  server: { host: '127.0.0.1', port: 10220, strictPort: true },
  plugins: [react(), tailwindcss()],
})
