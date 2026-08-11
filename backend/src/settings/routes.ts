import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { sessionCookie } from '../auth.ts'
import type { UserStore } from '../users/store.ts'
import { SettingsStore, WORKER_TOKEN_KEY } from './store.ts'

const setupSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      workerToken: { type: 'string', minLength: 16 },
      username: { type: 'string', minLength: 1, maxLength: 64 },
      password: { type: 'string', minLength: 8 },
    },
  },
} as const

interface SetupBody {
  workerToken?: string
  username?: string
  password?: string
}

export interface SetupOptions {
  /** Worker token managed via setup (no env token, requireSetup on). */
  tokenManaged: boolean
  /** Sessions enforced; setup must create the initial admin account. */
  authEnabled: boolean
}

/**
 * First-run setup: claims the worker token (generated unless provided) and/or
 * creates the initial admin account, whichever is still missing. One-shot: the
 * first caller configures everything and sees the token exactly once;
 * afterwards it returns 409. Standard first-visitor-claims-setup, matching the
 * LAN/VPN deployment assumption. The new admin is logged in via cookie so the
 * setup flow lands on the dashboard.
 */
export function settingsRoutes(
  app: FastifyInstance,
  settings: SettingsStore,
  users: UserStore,
  opts: SetupOptions,
) {
  const tokenNeeded = () => opts.tokenManaged && !settings.get(WORKER_TOKEN_KEY)
  const adminNeeded = () => opts.authEnabled && users.count() === 0

  app.get('/api/setup', () => ({
    needed: tokenNeeded() || adminNeeded(),
    workerTokenNeeded: tokenNeeded(),
    adminNeeded: adminNeeded(),
  }))

  app.post<{ Body: SetupBody }>('/api/setup', { schema: setupSchema }, async (req, reply) => {
    const needToken = tokenNeeded()
    const needAdmin = adminNeeded()
    if (!needToken && !needAdmin) return reply.code(409).send({ error: 'already configured' })
    if (needAdmin && (!req.body?.username || !req.body?.password)) {
      return reply.code(400).send({ error: 'username and password required' })
    }

    const result: { workerToken?: string } = {}
    if (needToken) {
      const token = req.body?.workerToken ?? randomBytes(32).toString('hex')
      settings.set(WORKER_TOKEN_KEY, token)
      result.workerToken = token
    }
    if (needAdmin) {
      const admin = users.create(req.body.username as string, req.body.password as string, 'admin')
      const session = users.createSession(admin.id)
      reply.header(
        'set-cookie',
        sessionCookie(session.token, session.expiresAt, req.protocol === 'https'),
      )
    }
    return reply.code(201).send(result)
  })
}
