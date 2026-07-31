import { afterAll, beforeAll, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'
import * as Y from 'yjs'
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider'
import { WebSocket } from 'ws'
import { createDb, type Db } from '@canvas/schema'
import { createSyncServer } from '../src/server.js'
import { createPersistence } from '../src/persistence.js'
import type { Pool } from 'pg'

const BOARD = 'board-persistencia'
let db: Db
let pool: Pool

beforeAll(async () => {
  ;({ db, pool } = createDb(process.env.DATABASE_URL!))
  await db.execute(sql`INSERT INTO boards (id, title) VALUES (${BOARD}, 'test')
                       ON CONFLICT (id) DO NOTHING`)
})

afterAll(async () => {
  await db.execute(sql`DELETE FROM boards WHERE id = ${BOARD}`)
  await pool.end()
})

/** Espera activa determinista: reintenta hasta que la condición se cumple o expira. */
async function waitFor(condition: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('waitFor: la condición no se cumplió a tiempo')
    await new Promise((r) => setTimeout(r, 20))
  }
}

async function connect(port: number, doc: Y.Doc): Promise<HocuspocusProvider> {
  // `WebSocketPolyfill` pertenece a la configuración del websocket, no a la del provider:
  // el tipo del provider solo admite `url` + `preserveTrailingSlash` cuando se le pasa una
  // url, así que el polyfill hay que inyectarlo construyendo el websocket a mano y
  // pasándolo como `websocketProvider`. Node no trae un WebSocket compatible.
  const websocketProvider = new HocuspocusProviderWebsocket({
    url: `ws://127.0.0.1:${port}`,
    WebSocketPolyfill: WebSocket,
  })

  let provider!: HocuspocusProvider

  // Se espera vía el callback `onSynced` de la configuración, que está en los tipos del
  // provider, en lugar de `provider.on('synced', ...)`: ese nombre de evento no está
  // garantizado por la API pública y un nombre equivocado dejaría el test colgado en vez
  // de fallar.
  await new Promise<void>((resolve) => {
    provider = new HocuspocusProvider({
      websocketProvider,
      name: BOARD,
      document: doc,
      onSynced: () => resolve(),
    })
  })

  return provider
}

test('el estado del documento sobrevive a un reinicio del servidor', async () => {
  const first = createSyncServer({ port: 4101, db })
  await first.listen()

  const docA = new Y.Doc()
  const providerA = await connect(4101, docA)
  docA.getMap('shapes').set('s1', 'rectangulo')

  // El `set` de arriba es local y sincrónico, pero el update viaja al servidor de forma
  // asíncrona: sin esperar a que llegue, `flushPendingStores()` persistiría un documento
  // que todavía no contiene la forma. Se espera consultando el documento del servidor, que
  // es determinista, en lugar de dormir un rato.
  await waitFor(() => first.hocuspocus.documents.get(BOARD)?.getMap('shapes').get('s1') === 'rectangulo')

  // Fuerza el flush de los onStoreDocument pendientes antes de tirar el servidor,
  // en lugar de esperar el debounce de 2 s. Devuelve void, no una promesa.
  first.hocuspocus.flushPendingStores()
  providerA.destroy()
  await first.destroy()

  const second = createSyncServer({ port: 4102, db })
  await second.listen()

  const docB = new Y.Doc()
  const providerB = await connect(4102, docB)
  expect(docB.getMap('shapes').get('s1')).toBe('rectangulo')

  providerB.destroy()
  await second.destroy()
})

test('el snapshot queda escrito en board_docs', async () => {
  const rows = await db.execute(sql`SELECT ydoc FROM board_docs WHERE board_id = ${BOARD}`)
  expect(rows.rows).toHaveLength(1)
  expect((rows.rows[0]!.ydoc as Buffer).byteLength).toBeGreaterThan(0)
})

test('un snapshot ilegible lanza en lugar de servir un documento vacío', async () => {
  const CORRUPT = 'board-corrupto'
  await db.execute(sql`INSERT INTO boards (id, title) VALUES (${CORRUPT}, 'corrupto')
                       ON CONFLICT (id) DO NOTHING`)
  await db.execute(sql`
    INSERT INTO board_docs (board_id, ydoc) VALUES (${CORRUPT}, ${Buffer.from([255, 255, 255, 255])})
    ON CONFLICT (board_id) DO UPDATE SET ydoc = EXCLUDED.ydoc
  `)

  const persistence = createPersistence(db)

  // Si esto devolviera null en vez de lanzar, Hocuspocus trataría el board como nuevo:
  // el usuario lo abriría vacío y su primera edición sobrescribiría el board real.
  await expect(
    persistence.configuration.fetch({ documentName: CORRUPT } as never),
  ).rejects.toThrow(/ilegible/)

  await db.execute(sql`DELETE FROM boards WHERE id = ${CORRUPT}`)
})
