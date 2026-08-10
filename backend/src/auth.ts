import { timingSafeEqual } from 'node:crypto'
import type { onRequestHookHandler } from 'fastify'

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
