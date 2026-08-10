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

/**
 * First-run setup. `enabled` is false when the token comes from the environment
 * (env always wins, setup is a no-op) or in open dev mode — then GET reports
 * nothing needed and POST refuses.
 *
 * POST is one-shot: the first caller sets (or generates) the token and sees it
 * exactly once; afterwards it returns 409. Standard first-visitor-claims-setup,
 * matching the LAN/VPN deployment assumption.
 */
export function settingsRoutes(app: FastifyInstance, settings: SettingsStore, enabled: boolean) {
  const needed = () => enabled && !settings.get(WORKER_TOKEN_KEY)

  app.get('/api/setup', () => ({ needed: needed() }))

  app.post<{ Body: SetupBody }>('/api/setup', { schema: setupSchema }, async (req, reply) => {
    if (!needed()) return reply.code(409).send({ error: 'already configured' })
    const token = req.body?.workerToken ?? randomBytes(32).toString('hex')
    settings.set(WORKER_TOKEN_KEY, token)
    return reply.code(201).send({ workerToken: token })
  })
}
