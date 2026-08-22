import type { FastifyInstance, onRequestHookHandler } from 'fastify'
import { parseCookies, principalFor, requireAdmin } from '../auth.ts'
import { SSO_COOKIE, type SsoVerifier } from '../sso.ts'
import type { AccessStore } from './store.ts'

const modelTagsSchema = {
  body: {
    type: 'object',
    required: ['tags'],
    additionalProperties: false,
    properties: {
      tags: { type: 'array', items: { type: 'string', minLength: 1 } },
    },
  },
} as const

const meSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: { return: { type: 'string' } },
  },
} as const

/**
 * Auth status for the SPA plus admin-only model-tag assignment. LatentForge
 * keeps no accounts: identity comes from usr's SSO cookie, and sign-in/out
 * live in usr. `me` stays outside the gate — it reports rather than rejects,
 * and hands the SPA the usr refresh URL for its `?return=`.
 */
export function accessRoutes(
  app: FastifyInstance,
  access: AccessStore,
  userAuth: onRequestHookHandler[],
  sso: SsoVerifier | undefined,
) {
  app.get<{ Querystring: { return?: string } }>('/api/auth/me', { schema: meSchema }, async (req) => {
    if (!sso) {
      return { authRequired: false, authenticated: true, user: null, sso: null, identity: null }
    }
    const identity = await sso.verify(parseCookies(req.headers.cookie)[SSO_COOKIE])
    const user = identity ? principalFor(identity) : null
    return {
      authRequired: true,
      authenticated: Boolean(user),
      user,
      identity,
      sso: {
        usrUrl: sso.config.usrUrl,
        app: sso.config.app,
        refreshUrl: req.query.return ? sso.refreshUrl(req.query.return) : null,
      },
    }
  })

  const adminOnly = { onRequest: userAuth, preHandler: requireAdmin }

  app.get('/api/model-tags', adminOnly, () => ({ models: access.modelTags() }))

  app.put<{ Params: { model: string }; Body: { tags: string[] } }>(
    '/api/model-tags/:model',
    { ...adminOnly, schema: modelTagsSchema },
    async (req) => {
      access.setModelTags(req.params.model, req.body.tags)
      return { model: req.params.model, tags: [...new Set(req.body.tags)].sort() }
    },
  )
}
