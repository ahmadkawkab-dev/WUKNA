import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // OAuth redirects must use the browser-facing host registered with Google.
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: false },
      '/hubs': { target: 'http://localhost:8080', changeOrigin: false, ws: true },
    },
  },
})
