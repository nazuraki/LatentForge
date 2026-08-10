import type { FastifyInstance } from 'fastify'
import { InvalidTransitionError, JobStore, type JobRequest, type JobStatus } from './store.ts'

const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'canceled'] as const

const createJobSchema = {
  body: {
    type: 'object',
    required: ['prompt'],
    additionalProperties: false,
    properties: {
      prompt: { type: 'string', minLength: 1 },
      model: { type: 'string', minLength: 1 },
      seed: { type: 'integer', minimum: 0 },
      params: { type: 'object' },
    },
  },
} as const

const listJobsSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: [...JOB_STATUSES] },
    },
  },
} as const

export function jobRoutes(app: FastifyInstance, store: JobStore) {
  app.post<{ Body: JobRequest }>('/api/jobs', { schema: createJobSchema }, async (req, reply) => {
    const job = store.create(req.body)
    return reply.code(201).send(job)
  })

  app.get<{ Querystring: { status?: JobStatus } }>(
    '/api/jobs',
    { schema: listJobsSchema },
    (req) => ({ jobs: store.list(req.query.status) }),
  )

  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    const job = store.get(req.params.id)
    if (!job) return reply.code(404).send({ error: 'job not found' })
    return job
  })

  app.post<{ Params: { id: string } }>('/api/jobs/:id/cancel', async (req, reply) => {
    if (!store.get(req.params.id)) return reply.code(404).send({ error: 'job not found' })
    try {
      return store.transition(req.params.id, 'canceled')
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return reply.code(409).send({ error: err.message })
      }
      throw err
    }
  })
}
