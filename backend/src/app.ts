import Fastify, { type FastifyServerOptions } from 'fastify'
import { jobRoutes } from './jobs/routes.ts'
import { JobStore } from './jobs/store.ts'
import { workerRoutes } from './workers/routes.ts'
import { WorkerStore } from './workers/store.ts'

export function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify({
    // Reject unknown body fields (default removeAdditional silently strips them)
    ajv: { customOptions: { removeAdditional: false } },
    ...opts,
  })
  const jobs = new JobStore()
  const workers = new WorkerStore()

  app.get('/api/health', () => ({ status: 'ok' }))
  jobRoutes(app, jobs)
  workerRoutes(app, workers, jobs)

  return app
}
