import { Hono } from 'hono'
import { healthRoute, type HealthDeps } from './routes/health.js'

export function createApp(deps: HealthDeps): Hono {
  const app = new Hono()
  app.route('/', healthRoute(deps))
  return app
}
