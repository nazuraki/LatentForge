import type { FastifyInstance, onRequestHookHandler } from 'fastify'
import { contentTypeFor, type AssetStore } from './store.ts'

// Session-gated: result images are user content. The cookie rides along on
// same-origin <img> requests, so no frontend changes are needed.
export function assetRoutes(
  app: FastifyInstance,
  assets: AssetStore,
  sessionAuth: onRequestHookHandler[],
) {
  app.get<{ Params: { name: string } }>('/api/assets/:name', { onRequest: sessionAuth }, async (req, reply) => {
    const data = await assets.read(req.params.name)
    if (!data) return reply.code(404).send({ error: 'asset not found' })
    return reply
      .header('content-type', contentTypeFor(req.params.name))
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(data)
  })
}
