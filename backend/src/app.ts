import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyServerOptions } from 'fastify'
import { assetRoutes } from './assets/routes.ts'
import { AssetStore } from './assets/store.ts'
import { accessRoutes } from './access/routes.ts'
import { AccessStore } from './access/store.ts'
import { requireBearerToken, requireResolvedBearerToken, requireUser } from './auth.ts'
import { jobRoutes } from './jobs/routes.ts'
import { JobStore } from './jobs/store.ts'
import { settingsRoutes } from './settings/routes.ts'
import { SettingsStore, WORKER_TOKEN_KEY } from './settings/store.ts'
import type { SsoVerifier } from './sso.ts'
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
   * First-run setup: when true and no env token is set, worker endpoints stay
   * 503 until POST /api/setup stores a worker token, so a production server is
   * never open to workers pre-setup. Off (dev/tests) = open.
   */
  requireSetup?: boolean
  /**
   * usr SSO verifier for browser-facing routes: identity comes from usr's
   * `nz_id` cookie and access from `latentforge:*` roles. Unset = the browser
   * side is open and every request acts as a local admin (dev/tests, or a
   * LAN/VPN deploy without usr).
   */
  sso?: SsoVerifier
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
  const access = config.dataDir
    ? new AccessStore(join(config.dataDir, 'latentforge.db'))
    : new AccessStore()
  const assets = new AssetStore(
    config.dataDir ? join(config.dataDir, 'assets') : resolve('data/assets'),
  )

  // Claims from a previous process died with it; put those jobs back in the queue.
  const recovered = jobs.recoverInterrupted()
  if (recovered > 0) app.log.warn({ recovered }, 're-queued jobs interrupted by restart')
  app.addHook('onClose', () => {
    jobs.close()
    settings.close()
    access.close()
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

  // Browser routes require a usr identity when SSO is configured; the worker
  // token covers workers only, never the browser side.
  if (!config.sso) app.log.warn('LATENTFORGE_USR_URL unset — browser endpoints are unauthenticated')
  const userAuth = [requireUser(config.sso)]

  app.get('/api/health', () => ({ status: 'ok' }))
  jobRoutes(app, jobs, access, userAuth)
  workerRoutes(app, workers, jobs, assets, workerAuth, access, userAuth)
  settingsRoutes(app, settings, { tokenManaged: setupManaged })
  assetRoutes(app, assets, userAuth)
  accessRoutes(app, access, userAuth, config.sso)

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
