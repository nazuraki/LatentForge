import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { SettingsStore, WORKER_TOKEN_KEY } from './store.ts'

const setupSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      workerToken: { type: 'string', minLength: 16 },
    },
  },
} as const

interface SetupBody {
  workerToken?: string
}

export interface SetupOptions {
  /** Worker token managed via setup (no env token, requireSetup on). */
  tokenManaged: boolean
}

/**
 * First-run setup: claims the worker token (generated unless provided).
 * One-shot: the first caller configures it and sees the token exactly once;
 * afterwards it returns 409. Standard first-visitor-claims-setup, matching the
 * LAN/VPN deployment assumption. Accounts are not part of setup — identity
 * comes from usr SSO.
 */
export function settingsRoutes(app: FastifyInstance, settings: SettingsStore, opts: SetupOptions) {
  const tokenNeeded = () => opts.tokenManaged && !settings.get(WORKER_TOKEN_KEY)

  app.get('/api/setup', () => ({ needed: tokenNeeded(), workerTokenNeeded: tokenNeeded() }))

  app.post<{ Body: SetupBody }>('/api/setup', { schema: setupSchema }, async (req, reply) => {
    if (!tokenNeeded()) return reply.code(409).send({ error: 'already configured' })
    const token = req.body?.workerToken ?? randomBytes(32).toString('hex')
    settings.set(WORKER_TOKEN_KEY, token)
    return reply.code(201).send({ workerToken: token })
  })
}
