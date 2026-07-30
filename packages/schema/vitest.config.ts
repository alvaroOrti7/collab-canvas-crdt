import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Los tests tocan un Postgres compartido: en paralelo se pisarían las filas.
    fileParallelism: false,
  },
})
