import Fastify, { type FastifyServerOptions } from 'fastify'
import { jobRoutes } from './jobs/routes.ts'
import { JobStore } from './jobs/store.ts'

export function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify({
    // Reject unknown body fields (default removeAdditional silently strips them)
    ajv: { customOptions: { removeAdditional: false } },
    ...opts,
  })
  const jobs = new JobStore()

  app.get('/api/health', () => ({ status: 'ok' }))
  jobRoutes(app, jobs)

  return app
}
