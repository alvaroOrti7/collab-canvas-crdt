import { Hono } from 'hono'
import { healthRoute, type HealthDeps } from './routes/health.js'
import { boardsRoute } from './routes/boards.js'

export function createApp(deps: HealthDeps): Hono {
  const app = new Hono()
  app.route('/', healthRoute(deps))
  app.route('/', boardsRoute({ db: deps.db }))
  return app
}
