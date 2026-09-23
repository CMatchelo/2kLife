import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api/': 'http://127.0.0.1:4319' } },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy: { '/api/': 'http://127.0.0.1:4319' } },
})
