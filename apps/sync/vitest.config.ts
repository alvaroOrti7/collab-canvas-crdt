import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Cada test abre un servidor y toca la misma tabla: en paralelo se estorban.
    fileParallelism: false,
    testTimeout: 20_000,
  },
})
