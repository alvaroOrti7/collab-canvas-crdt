import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // El bind mount desde macOS no propaga eventos inotify de forma fiable;
    // sin polling el HMR se pierde cambios.
    watch: { usePolling: true },
  },
})
