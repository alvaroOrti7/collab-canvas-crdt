import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './tables.js'

export type Db = NodePgDatabase<typeof schema>

export function createDb(connectionString: string): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString })
  return { db: drizzle(pool, { schema }), pool }
}
