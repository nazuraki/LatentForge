import type { FastifyInstance } from 'fastify'
import { contentTypeFor, type AssetStore } from './store.ts'

export function assetRoutes(app: FastifyInstance, assets: AssetStore) {
  app.get<{ Params: { name: string } }>('/api/assets/:name', async (req, reply) => {
    const data = await assets.read(req.params.name)
    if (!data) return reply.code(404).send({ error: 'asset not found' })
    return reply
      .header('content-type', contentTypeFor(req.params.name))
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(data)
  })
}
