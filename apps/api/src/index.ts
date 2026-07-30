import { serve } from '@hono/node-server'
import { createClient } from 'redis'
import { createDb } from '@canvas/schema'
import { createApp } from './app.js'

const port = Number(process.env.API_PORT ?? 3001)

const { db } = createDb(process.env.DATABASE_URL!)
const redis = createClient({ url: process.env.REDIS_URL! })
await redis.connect()

serve({ fetch: createApp({ db, redis }).fetch, port })
console.log(`api escuchando en :${port}`)
