import { Hono } from 'hono'
import { boards, type Db } from '@canvas/schema'

export interface BoardsDeps {
  db: Db
}

/**
 * `PUT` y no `POST` porque es idempotente: abrir el mismo board dos veces no debe fallar ni
 * duplicar. La creación vive aquí y no en `sync` a propósito — en la fase 2 este endpoint
 * llevará el guard de autenticación, mientras que un upsert desde el WebSocket dejaría que
 * cualquiera creara boards con solo conectarse.
 */
export function boardsRoute(deps: BoardsDeps): Hono {
  const route = new Hono()

  route.put('/boards/:id', async (c) => {
    const id = c.req.param('id').trim()
    if (!id) return c.json({ error: 'el id del board no puede estar vacío' }, 400)

    await deps.db
      .insert(boards)
      .values({ id, title: id })
      .onConflictDoNothing({ target: boards.id })

    return c.json({ id })
  })

  return route
}
