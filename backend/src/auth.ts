import { timingSafeEqual } from 'node:crypto'
import type { onRequestHookHandler } from 'fastify'

/**
 * onRequest hook requiring `Authorization: Bearer <token>`.
 * Runs before body parsing, so unauthenticated clients can't submit large payloads.
 */
export function requireBearerToken(token: string): onRequestHookHandler {
  const expected = Buffer.from(`Bearer ${token}`)
  return (req, reply, done) => {
    const got = Buffer.from(req.headers.authorization ?? '')
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
      reply.code(401).send({ error: 'unauthorized' })
      return
    }
    done()
  }
}
