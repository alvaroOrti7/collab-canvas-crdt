import { Server } from '@hocuspocus/server'
import { Redis } from '@hocuspocus/extension-redis'
import type { Extension } from '@hocuspocus/server'
import type { Db } from '@canvas/schema'
import { createPersistence } from './persistence.js'

/**
 * Intervalo de ping del servidor: si no llega el pong, corta la conexión. Es el
 * mecanismo que purga los cursores fantasma de §5.4 del spec — el awareness de una
 * conexión terminada se limpia y se propaga solo.
 */
export const SYNC_TIMEOUT_MS = 30_000

export const STORE_DEBOUNCE_MS = 2_000
export const STORE_MAX_DEBOUNCE_MS = 10_000

export interface SyncServerOptions {
  port: number
  db: Db
  redisUrl?: string
}

export function createSyncServer({ port, db, redisUrl }: SyncServerOptions): Server {
  const extensions: Extension[] = [createPersistence(db)]

  // Redis solo aporta con más de una réplica. En los tests se omite para no
  // acoplarlos a un servicio que no están verificando.
  if (redisUrl) {
    const parsed = new URL(redisUrl)
    extensions.push(new Redis({ host: parsed.hostname, port: Number(parsed.port) }))
  }

  return new Server({
    port,
    timeout: SYNC_TIMEOUT_MS,
    debounce: STORE_DEBOUNCE_MS,
    maxDebounce: STORE_MAX_DEBOUNCE_MS,
    quiet: true,
    extensions,
  })
}
