import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyServerOptions } from 'fastify'
import { assetRoutes } from './assets/routes.ts'
import { AssetStore } from './assets/store.ts'
import { requireBearerToken, requireResolvedBearerToken, requireSession } from './auth.ts'
import { jobRoutes } from './jobs/routes.ts'
import { JobStore } from './jobs/store.ts'
import { settingsRoutes } from './settings/routes.ts'
import { SettingsStore, WORKER_TOKEN_KEY } from './settings/store.ts'
import { userRoutes } from './users/routes.ts'
import { UserStore } from './users/store.ts'
import { workerRoutes } from './workers/routes.ts'
import { WorkerStore } from './workers/store.ts'

export interface AppConfig {
  /**
   * Data root: the SQLite database lives at <dataDir>/latentforge.db and stored
   * assets under <dataDir>/assets. Unset = in-memory jobs + default assets dir (dev/tests).
   */
  dataDir?: string
  /** Shared bearer token required on worker-facing endpoints. Unset = open (dev/tests). */
  workerToken?: string
  /**
   * First-run setup + auth: when true, UI routes require a login session and
   * POST /api/setup bootstraps the initial admin account (plus the worker
   * token, unless one came from the environment — env always wins for the
   * token). Gated routes return 503 until setup completes, so a production
   * server is never open pre-setup. Off (dev/tests) = fully open.
   */
  requireSetup?: boolean
  /** Built frontend to serve (SPA fallback included). Served only if the directory exists. */
  staticDir?: string
}

export function buildApp(opts: FastifyServerOptions = {}, config: AppConfig = {}) {
  const app = Fastify({
    // Reject unknown body fields (default removeAdditional silently strips them)
    ajv: { customOptions: { removeAdditional: false } },
    // Worker results carry base64-encoded images
    bodyLimit: 32 * 1024 * 1024,
    ...opts,
  })

  if (config.dataDir) mkdirSync(config.dataDir, { recursive: true })
  const jobs = config.dataDir ? new JobStore(join(config.dataDir, 'latentforge.db')) : new JobStore()
  const settings = config.dataDir
    ? new SettingsStore(join(config.dataDir, 'latentforge.db'))
    : new SettingsStore()
  const workers = new WorkerStore()
  const users = config.dataDir
    ? new UserStore(join(config.dataDir, 'latentforge.db'))
    : new UserStore()
  const assets = new AssetStore(
    config.dataDir ? join(config.dataDir, 'assets') : resolve('data/assets'),
  )

  // Claims from a previous process died with it; put those jobs back in the queue.
  const recovered = jobs.recoverInterrupted()
  if (recovered > 0) app.log.warn({ recovered }, 're-queued jobs interrupted by restart')
  app.addHook('onClose', () => {
    jobs.close()
    settings.close()
    users.close()
  })

  const setupManaged = !config.workerToken && Boolean(config.requireSetup)

  // Worker-facing routes require the shared token; GET /api/workers is UI-facing and stays open.
  // Env token wins; otherwise setup mode resolves the token from settings per request
  // (503 until first-run setup stores one); neither = open (dev/tests only).
  const workerAuth = config.workerToken
    ? [requireBearerToken(config.workerToken)]
    : setupManaged
      ? [requireResolvedBearerToken(() => settings.get(WORKER_TOKEN_KEY))]
      : []
  if (workerAuth.length === 0) {
    app.log.warn('LATENTFORGE_WORKER_TOKEN unset — worker endpoints are unauthenticated')
  }

  // UI routes require a login session whenever setup mode is on; an env-provided
  // worker token covers workers only, never the browser side.
  const authEnabled = Boolean(config.requireSetup)
  const sessionAuth = [requireSession({ enabled: authEnabled, users })]

  app.get('/api/health', () => ({ status: 'ok' }))
  jobRoutes(app, jobs, users, sessionAuth)
  workerRoutes(app, workers, jobs, assets, workerAuth, users, sessionAuth)
  settingsRoutes(app, settings, users, { tokenManaged: setupManaged, authEnabled })
  assetRoutes(app, assets, sessionAuth)
  userRoutes(app, users, sessionAuth, authEnabled)

  if (config.staticDir && existsSync(config.staticDir)) {
    app.register(fastifyStatic, { root: resolve(config.staticDir) })
    app.setNotFoundHandler((req, reply) => {
      // SPA fallback: client-side routes resolve to the app shell; API 404s stay JSON.
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        return reply.sendFile('index.html')
      }
      return reply.code(404).send({ error: 'not found' })
    })
  }

  return app
}
