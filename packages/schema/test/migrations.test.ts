import { afterAll, beforeAll, expect, test } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { boardDocs, boards, createDb, type Db } from '../src/index.js'
import type { Pool } from 'pg'

let db: Db
let pool: Pool

beforeAll(async () => {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL no está definida: ejecuta el test dentro del contenedor')
  ;({ db, pool } = createDb(url))
})

afterAll(async () => {
  await pool.end()
})

test('la tabla board_docs guarda el ydoc como bytea', async () => {
  const rows = await db.execute(sql`
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'board_docs' AND column_name = 'ydoc'
  `)
  expect(rows.rows[0]).toEqual({ data_type: 'bytea' })
})

test('board_members restringe el rol a los tres valores del spec', async () => {
  const rows = await db.execute(sql`
    SELECT unnest(enum_range(NULL::board_role))::text AS role ORDER BY role
  `)
  expect(rows.rows.map((r) => r.role)).toEqual(['editor', 'owner', 'viewer'])
})

test('un ydoc escrito se recupera byte a byte', async () => {
  const bytes = new Uint8Array([1, 2, 3, 250, 251, 252])
  await db.execute(sql`INSERT INTO boards (id, title) VALUES ('t1', 'test')`)
  await db.execute(sql`INSERT INTO board_docs (board_id, ydoc) VALUES ('t1', ${Buffer.from(bytes)})`)

  const rows = await db.execute(sql`SELECT ydoc FROM board_docs WHERE board_id = 't1'`)
  expect(new Uint8Array(rows.rows[0]!.ydoc as Buffer)).toEqual(bytes)

  await db.execute(sql`DELETE FROM boards WHERE id = 't1'`)
})

test('el customType convierte en ambos sentidos a través del query builder', async () => {
  const bytes = new Uint8Array([0, 127, 128, 255, 42])
  await db.insert(boards).values({ id: 't2', title: 'roundtrip' })
  await db.insert(boardDocs).values({ boardId: 't2', ydoc: bytes })

  const [row] = await db.select().from(boardDocs).where(eq(boardDocs.boardId, 't2'))

  // El test de arriba usa SQL crudo y solo prueba que Postgres mueve un Buffer a una
  // columna bytea. Este pasa por el query builder, que es el único camino que ejercita
  // toDriver/fromDriver del customType — la conversión que consumen `api` y `sync`.
  expect(row!.ydoc).toBeInstanceOf(Uint8Array)
  expect(row!.ydoc).toEqual(bytes)

  await db.execute(sql`DELETE FROM boards WHERE id = 't2'`)
})
