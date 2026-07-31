import { createDb } from '@canvas/schema'
import { createSyncServer } from './server.js'

const port = Number(process.env.SYNC_PORT ?? 1234)
const { db } = createDb(process.env.DATABASE_URL!)

const server = createSyncServer({ port, db, redisUrl: process.env.REDIS_URL })
await server.listen()
console.log(`sync escuchando en ws://0.0.0.0:${port}`)
