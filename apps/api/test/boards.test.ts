import { afterAll, beforeAll, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '@canvas/schema'
import { createApp } from '../src/app.js'
import type { Pool } from 'pg'

const BOARD = 'board-api-test'
let db: Db
let pool: Pool

beforeAll(async () => {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL no está definida: ejecuta el test dentro del contenedor')
  ;({ db, pool } = createDb(url))
  await db.execute(sql`DELETE FROM boards WHERE id = ${BOARD}`)
})

afterAll(async () => {
  await db.execute(sql`DELETE FROM boards WHERE id = ${BOARD}`)
  // Guarda: si beforeAll falló, `pool` es undefined y sin esto el TypeError taparía el error real.
  if (pool) await pool.end()
})

const app = () => createApp({ db, redis: { ping: async () => 'PONG' } })

test('crea el board si no existía', async () => {
  const res = await app().request(`/boards/${BOARD}`, { method: 'PUT' })

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ id: BOARD })

  const rows = await db.execute(sql`SELECT id FROM boards WHERE id = ${BOARD}`)
  expect(rows.rows).toHaveLength(1)
})

test('es idempotente: llamarlo dos veces no duplica ni falla', async () => {
  await app().request(`/boards/${BOARD}`, { method: 'PUT' })
  const res = await app().request(`/boards/${BOARD}`, { method: 'PUT' })

  expect(res.status).toBe(200)
  const rows = await db.execute(sql`SELECT id FROM boards WHERE id = ${BOARD}`)
  expect(rows.rows).toHaveLength(1)
})

test('rechaza un id vacío', async () => {
  const res = await app().request('/boards/%20', { method: 'PUT' })
  expect(res.status).toBe(400)
})
