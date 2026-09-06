import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // El bind mount desde macOS no propaga eventos inotify de forma fiable;
    // sin polling el HMR se pierde cambios.
    watch: { usePolling: true },
    // El contenedor `e2e` llega como `http://web:5173` (nombre del servicio en la red
    // de Docker), y Vite 8 rechaza por defecto cualquier Host que no reconozca.
    allowedHosts: ['web'],
    proxy: {
      '/sync': {
        target: 'ws://sync:1234',
        ws: true,
        rewrite: (path) => path.replace(/^\/sync/, ''),
      },
      '/api': {
        target: 'http://api:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
