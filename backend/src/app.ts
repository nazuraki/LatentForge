import { resolve } from 'node:path'
import Fastify, { type FastifyServerOptions } from 'fastify'
import { assetRoutes } from './assets/routes.ts'
import { AssetStore } from './assets/store.ts'
import { jobRoutes } from './jobs/routes.ts'
import { JobStore } from './jobs/store.ts'
import { workerRoutes } from './workers/routes.ts'
import { WorkerStore } from './workers/store.ts'

export interface AppConfig {
  /** Directory for stored assets (generated images). */
  dataDir?: string
}

export function buildApp(opts: FastifyServerOptions = {}, config: AppConfig = {}) {
  const app = Fastify({
    // Reject unknown body fields (default removeAdditional silently strips them)
    ajv: { customOptions: { removeAdditional: false } },
    // Worker results carry base64-encoded images
    bodyLimit: 32 * 1024 * 1024,
    ...opts,
  })
  const jobs = new JobStore()
  const workers = new WorkerStore()
  const assets = new AssetStore(config.dataDir ?? resolve('data/assets'))

  app.get('/api/health', () => ({ status: 'ok' }))
  jobRoutes(app, jobs)
  workerRoutes(app, workers, jobs, assets)
  assetRoutes(app, assets)

  return app
}
