import type { FastifyInstance, onRequestHookHandler } from 'fastify'
import type { AssetStore } from '../assets/store.ts'
import { InvalidTransitionError, type JobOutput, type JobStore } from '../jobs/store.ts'
import type { UserStore } from '../users/store.ts'
import type { WorkerRegistration, WorkerStore } from './store.ts'

const registerSchema = {
  body: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1 },
      models: { type: 'array', items: { type: 'string', minLength: 1 } },
    },
  },
} as const

const resultSchema = {
  body: {
    type: 'object',
    required: ['status'],
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: ['succeeded', 'failed'] },
      error: { type: 'string' },
      images: { type: 'array', items: { type: 'string', contentEncoding: 'base64' } },
      seed: { type: 'integer', minimum: 0 },
    },
  },
} as const

interface ResultBody {
  status: 'succeeded' | 'failed'
  error?: string
  images?: string[]
  seed?: number
}

export function workerRoutes(
  app: FastifyInstance,
  workers: WorkerStore,
  jobs: JobStore,
  assets: AssetStore,
  onRequest: onRequestHookHandler[],
  users: UserStore,
  sessionAuth: onRequestHookHandler[],
) {

  app.post<{ Body: WorkerRegistration }>(
    '/api/workers',
    { schema: registerSchema, onRequest },
    async (req, reply) => reply.code(201).send(workers.register(req.body)),
  )

  // UI-facing: models are narrowed to the caller's allowed set, so the model
  // picker only ever offers what the user may actually run.
  app.get('/api/workers', { onRequest: sessionAuth }, (req) => {
    const user = req.user as NonNullable<typeof req.user>
    return {
      workers: workers.list().map((w) => ({ ...w, models: users.filterModels(user, w.models) })),
    }
  })

  app.post<{ Params: { id: string } }>(
    '/api/workers/:id/heartbeat',
    { onRequest },
    async (req, reply) => {
      const worker = workers.heartbeat(req.params.id)
      if (!worker) return reply.code(404).send({ error: 'worker not found' })
      return worker
    },
  )

  // Claiming counts as a heartbeat — a polling worker shouldn't need both calls.
  app.post<{ Params: { id: string } }>(
    '/api/workers/:id/claim',
    { onRequest },
    async (req, reply) => {
      const worker = workers.heartbeat(req.params.id)
      if (!worker) return reply.code(404).send({ error: 'worker not found' })
      const job = jobs.claimNext(worker.id)
      if (!job) return reply.code(204).send()
      return job
    },
  )

  app.post<{ Params: { id: string; jobId: string }; Body: ResultBody }>(
    '/api/workers/:id/jobs/:jobId/result',
    { schema: resultSchema, onRequest },
    async (req, reply) => {
      const worker = workers.heartbeat(req.params.id)
      if (!worker) return reply.code(404).send({ error: 'worker not found' })
      const job = jobs.get(req.params.jobId)
      if (!job) return reply.code(404).send({ error: 'job not found' })
      if (job.workerId !== worker.id) {
        return reply.code(403).send({ error: 'job is not assigned to this worker' })
      }
      if (job.status !== 'running') {
        return reply
          .code(409)
          .send({ error: `cannot transition job from ${job.status} to ${req.body.status}` })
      }

      let output: JobOutput | undefined
      if (req.body.status === 'succeeded' && req.body.images?.length) {
        const images: string[] = []
        for (const [i, b64] of req.body.images.entries()) {
          const name = `${job.id}-${i}.png`
          await assets.save(name, Buffer.from(b64, 'base64'))
          images.push(`/api/assets/${name}`)
        }
        output = { images, seed: req.body.seed }
      }

      try {
        return jobs.transition(job.id, req.body.status, { error: req.body.error, output })
      } catch (err) {
        if (err instanceof InvalidTransitionError) {
          return reply.code(409).send({ error: err.message })
        }
        throw err
      }
    },
  )
}
