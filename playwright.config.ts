import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Los tests comparten board y servidor de sync: en paralelo se interfieren.
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
})
