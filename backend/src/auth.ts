import { timingSafeEqual } from 'node:crypto'
import type { onRequestHookHandler } from 'fastify'
import { SSO_COOKIE, type Identity, type SsoVerifier } from './sso.ts'

export type Role = 'admin' | 'user'

/** The caller on session-gated routes, derived from the usr identity. */
export interface Principal {
  /** usr email — also the job owner key. */
  id: string
  username: string
  role: Role
  /** Model-access tags = the caller's latentforge roles (admins bypass tags anyway). */
  tags: string[]
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by requireUser on session-gated routes. */
    user?: Principal
  }
}

function bearerMatches(header: string | undefined, token: string): boolean {
  const expected = Buffer.from(`Bearer ${token}`)
  const got = Buffer.from(header ?? '')
  return got.length === expected.length && timingSafeEqual(got, expected)
}

/**
 * onRequest hook requiring `Authorization: Bearer <token>`.
 * Runs before body parsing, so unauthenticated clients can't submit large payloads.
 */
export function requireBearerToken(token: string): onRequestHookHandler {
  return (req, reply, done) => {
    if (!bearerMatches(req.headers.authorization, token)) {
      reply.code(401).send({ error: 'unauthorized' })
      return
    }
    done()
  }
}

/**
 * Like requireBearerToken, but the token is resolved per request — it may be
 * set at runtime via first-run setup. Until one exists, requests get 503 so a
 * production server is never open pre-setup.
 */
export function requireResolvedBearerToken(
  resolveToken: () => string | undefined,
): onRequestHookHandler {
  return (req, reply, done) => {
    const token = resolveToken()
    if (!token) {
      reply.code(503).send({ error: 'setup required' })
      return
    }
    if (!bearerMatches(req.headers.authorization, token)) {
      reply.code(401).send({ error: 'unauthorized' })
      return
    }
    done()
  }
}

// ── Browser identity (usr SSO) ───────────────────────────────────────────────

/** Minimal Cookie-header parser — one well-known cookie, no dependency needed. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of header?.split(';') ?? []) {
    const sep = part.indexOf('=')
    if (sep < 0) continue
    out[part.slice(0, sep).trim()] = part.slice(sep + 1).trim()
  }
  return out
}

export const OPEN_ADMIN: Principal = { id: 'local', username: 'local', role: 'admin', tags: [] }

/**
 * A usr identity becomes a principal only if it holds a latentforge role:
 * `admin` → admin; any other role → user, with every role doubling as a
 * model-access tag. No role = no access.
 */
export function principalFor(identity: Identity): Principal | null {
  if (identity.roles.length === 0) return null
  return {
    id: identity.email,
    username: identity.email,
    role: identity.roles.includes('admin') ? 'admin' : 'user',
    tags: identity.roles,
  }
}

/**
 * onRequest hook resolving usr's `nz_id` cookie to `req.user`. No verifier
 * (dev/tests, or a deploy without LATENTFORGE_USR_URL) = every request acts as
 * a local admin, mirroring the open worker-token mode. Missing/invalid cookie
 * = 401 (the SPA bounces to usr); valid identity without a role = 403.
 */
export function requireUser(sso: SsoVerifier | undefined): onRequestHookHandler {
  return (req, reply, done) => {
    if (!sso) {
      req.user = OPEN_ADMIN
      done()
      return
    }
    sso.verify(parseCookies(req.headers.cookie)[SSO_COOKIE]).then((identity) => {
      if (!identity) {
        reply.code(401).send({ error: 'unauthorized' })
        return
      }
      const principal = principalFor(identity)
      if (!principal) {
        reply.code(403).send({ error: 'no access' })
        return
      }
      req.user = principal
      done()
    }, done)
  }
}

/** preHandler for admin-only routes; assumes requireUser ran first. */
export const requireAdmin: onRequestHookHandler = (req, reply, done) => {
  if (req.user?.role !== 'admin') {
    reply.code(403).send({ error: 'admin only' })
    return
  }
  done()
}
