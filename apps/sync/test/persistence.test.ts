import { afterAll, beforeAll, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'
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

async function connect(port: number, doc: Y.Doc, name: string = BOARD): Promise<HocuspocusProvider> {
  let provider!: HocuspocusProvider

  // Dos decisiones no obvias, ambas verificadas empíricamente contra Node 24.18.1:
  //
  // 1. Se pasa `url` a secas, sin `WebSocketPolyfill` ni un `websocketProvider` externo:
  //    Node 24 ya trae un WebSocket global compatible. Inyectar el polyfill obliga a
  //    construir el websocket a mano, y con un websocket externo el provider queda con
  //    `manageSocket: false` y no se registra salvo que se llame a `provider.attach()`,
  //    con lo que la conexión muere por timeout. Toda esa cadena es evitable.
  // 2. Se espera con el callback `onSynced` de la configuración, no con
  //    `provider.on('synced', ...)`: ese nombre de evento no está en los tipos públicos y
  //    equivocarlo dejaría el test colgado en lugar de fallar.
  await new Promise<void>((resolve) => {
    provider = new HocuspocusProvider({
      url: `ws://127.0.0.1:${port}`,
      name,
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
  // Board y servidor propios: este test no debe depender de que el anterior haya
  // escrito nada (si se ejecuta solo, con `vitest -t`, o el fichero se reordena, el
  // anterior podría no haber corrido y esta comprobación no tendría nada que leer).
  const SNAPSHOT_BOARD = 'board-snapshot'
  await db.execute(sql`INSERT INTO boards (id, title) VALUES (${SNAPSHOT_BOARD}, 'snapshot')
                       ON CONFLICT (id) DO NOTHING`)

  const server = createSyncServer({ port: 4103, db })
  await server.listen()

  const doc = new Y.Doc()
  const provider = await connect(4103, doc, SNAPSHOT_BOARD)
  doc.getMap('shapes').set('s1', 'rectangulo')
  await waitFor(
    () => server.hocuspocus.documents.get(SNAPSHOT_BOARD)?.getMap('shapes').get('s1') === 'rectangulo',
  )
  server.hocuspocus.flushPendingStores()
  provider.destroy()
  await server.destroy()

  const rows = await db.execute(sql`SELECT ydoc FROM board_docs WHERE board_id = ${SNAPSHOT_BOARD}`)
  expect(rows.rows).toHaveLength(1)
  expect((rows.rows[0]!.ydoc as Buffer).byteLength).toBeGreaterThan(0)

  await db.execute(sql`DELETE FROM boards WHERE id = ${SNAPSHOT_BOARD}`)
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
