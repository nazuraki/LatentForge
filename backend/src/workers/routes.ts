import type { FastifyInstance } from 'fastify'
import { InvalidTransitionError, type JobStore } from '../jobs/store.ts'
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
    },
  },
} as const

export function workerRoutes(app: FastifyInstance, workers: WorkerStore, jobs: JobStore) {
  app.post<{ Body: WorkerRegistration }>(
    '/api/workers',
    { schema: registerSchema },
    async (req, reply) => reply.code(201).send(workers.register(req.body)),
  )

  app.get('/api/workers', () => ({ workers: workers.list() }))

  app.post<{ Params: { id: string } }>('/api/workers/:id/heartbeat', async (req, reply) => {
    const worker = workers.heartbeat(req.params.id)
    if (!worker) return reply.code(404).send({ error: 'worker not found' })
    return worker
  })

  // Claiming counts as a heartbeat — a polling worker shouldn't need both calls.
  app.post<{ Params: { id: string } }>('/api/workers/:id/claim', async (req, reply) => {
    const worker = workers.heartbeat(req.params.id)
    if (!worker) return reply.code(404).send({ error: 'worker not found' })
    const job = jobs.claimNext(worker.id)
    if (!job) return reply.code(204).send()
    return job
  })

  app.post<{ Params: { id: string; jobId: string }; Body: { status: 'succeeded' | 'failed'; error?: string } }>(
    '/api/workers/:id/jobs/:jobId/result',
    { schema: resultSchema },
    async (req, reply) => {
      const worker = workers.heartbeat(req.params.id)
      if (!worker) return reply.code(404).send({ error: 'worker not found' })
      const job = jobs.get(req.params.jobId)
      if (!job) return reply.code(404).send({ error: 'job not found' })
      if (job.workerId !== worker.id) {
        return reply.code(403).send({ error: 'job is not assigned to this worker' })
      }
      try {
        return jobs.transition(job.id, req.body.status, req.body.error)
      } catch (err) {
        if (err instanceof InvalidTransitionError) {
          return reply.code(409).send({ error: err.message })
        }
        throw err
      }
    },
  )
}
