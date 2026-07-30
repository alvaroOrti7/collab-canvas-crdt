import { expect, test } from 'vitest'
import { createApp } from '../src/app.js'
import type { Db } from '@canvas/schema'

const okDb = { execute: async () => ({ rows: [{ '?column?': 1 }] }) } as unknown as Db
const failDb = {
  execute: async () => {
    throw new Error('conexión rechazada')
  },
} as unknown as Db

test('devuelve 200 y ok cuando db y redis responden', async () => {
  const app = createApp({ db: okDb, redis: { ping: async () => 'PONG' } })
  const res = await app.request('/health')

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ status: 'ok', checks: { db: true, redis: true } })
})

test('devuelve 503 y marca el fallo cuando la db no responde', async () => {
  const app = createApp({ db: failDb, redis: { ping: async () => 'PONG' } })
  const res = await app.request('/health')

  expect(res.status).toBe(503)
  expect(await res.json()).toEqual({ status: 'degraded', checks: { db: false, redis: true } })
})

test('devuelve 503 cuando redis no responde', async () => {
  const app = createApp({
    db: okDb,
    redis: {
      ping: async () => {
        throw new Error('timeout')
      },
    },
  })
  const res = await app.request('/health')

  expect(res.status).toBe(503)
  expect(await res.json()).toEqual({ status: 'degraded', checks: { db: true, redis: false } })
})
