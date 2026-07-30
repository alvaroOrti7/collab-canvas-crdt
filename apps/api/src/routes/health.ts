import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import type { Db } from '@canvas/schema'

export interface RedisClientLike {
  ping(): Promise<string>
}

export interface HealthDeps {
  db: Db
  redis: RedisClientLike
}

async function succeeds(probe: () => Promise<unknown>): Promise<boolean> {
  try {
    await probe()
    return true
  } catch {
    return false
  }
}

export function healthRoute(deps: HealthDeps): Hono {
  const route = new Hono()

  route.get('/health', async (c) => {
    const [db, redis] = await Promise.all([
      succeeds(() => deps.db.execute(sql`SELECT 1`)),
      succeeds(() => deps.redis.ping()),
    ])

    const healthy = db && redis
    return c.json(
      { status: healthy ? 'ok' : 'degraded', checks: { db, redis } },
      healthy ? 200 : 503,
    )
  })

  return route
}
