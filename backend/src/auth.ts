import { timingSafeEqual } from 'node:crypto'
import type { onRequestHookHandler } from 'fastify'
import type { Role, UserStore } from './users/store.ts'

export interface SessionUser {
  id: string
  username: string
  role: Role
  tags: string[]
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by requireSession on session-gated routes. */
    user?: SessionUser
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

// ── Browser sessions ─────────────────────────────────────────────────────────

export const SESSION_COOKIE = 'latentforge_session'

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

/** Secure is set only over https so plain-http LAN deploys still get a cookie. */
export function sessionCookie(token: string, expiresAt: Date, secure: boolean): string {
  const secureAttr = secure ? '; Secure' : ''
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${secureAttr}; Expires=${expiresAt.toUTCString()}`
}

export function clearSessionCookie(secure: boolean): string {
  const secureAttr = secure ? '; Secure' : ''
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secureAttr}; Max-Age=0`
}

const OPEN_ADMIN: SessionUser = { id: 'local', username: 'local', role: 'admin', tags: [] }

/**
 * onRequest hook resolving the session cookie to `req.user`. Disabled (dev/
 * tests) = every request acts as a local admin, mirroring the open worker-token
 * mode. Enabled with no accounts yet = 503, so a production server is never
 * open pre-setup.
 */
export function requireSession(opts: { enabled: boolean; users: UserStore }): onRequestHookHandler {
  return (req, reply, done) => {
    if (!opts.enabled) {
      req.user = OPEN_ADMIN
      done()
      return
    }
    if (opts.users.count() === 0) {
      reply.code(503).send({ error: 'setup required' })
      return
    }
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
    const user = token ? opts.users.userForSession(token) : undefined
    if (!user) {
      reply.code(401).send({ error: 'unauthorized' })
      return
    }
    req.user = { id: user.id, username: user.username, role: user.role, tags: user.tags }
    done()
  }
}

/** preHandler for admin-only routes; assumes requireSession ran first. */
export const requireAdmin: onRequestHookHandler = (req, reply, done) => {
  if (req.user?.role !== 'admin') {
    reply.code(403).send({ error: 'admin only' })
    return
  }
  done()
}
