import type { FastifyInstance, FastifyRequest, onRequestHookHandler } from 'fastify'
import type { AccessStore } from '../access/store.ts'
import { InvalidTransitionError, JobStore, type Job, type JobRequest, type JobStatus } from './store.ts'

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

/** Owner-or-admin; 404 (not 403) so job ids aren't confirmed to other users. */
function visibleTo(job: Job, req: FastifyRequest): boolean {
  const user = req.user as NonNullable<typeof req.user>
  return user.role === 'admin' || job.userId === user.id
}

export function jobRoutes(
  app: FastifyInstance,
  store: JobStore,
  access: AccessStore,
  sessionAuth: onRequestHookHandler[],
) {
  app.post<{ Body: JobRequest }>(
    '/api/jobs',
    { schema: createJobSchema, onRequest: sessionAuth },
    async (req, reply) => {
      const user = req.user as NonNullable<typeof req.user>
      // Server-side access enforcement — the filtered picker is just convenience.
      if (req.body.model && !access.canUseModel(user, req.body.model)) {
        return reply.code(403).send({ error: `model not allowed: ${req.body.model}` })
      }
      const job = store.create(req.body, user.id)
      return reply.code(201).send(job)
    },
  )

  app.get<{ Querystring: { status?: JobStatus } }>(
    '/api/jobs',
    { schema: listJobsSchema, onRequest: sessionAuth },
    (req) => {
      const user = req.user as NonNullable<typeof req.user>
      const owner = user.role === 'admin' ? undefined : user.id
      return { jobs: store.list(req.query.status, owner) }
    },
  )

  app.get<{ Params: { id: string } }>(
    '/api/jobs/:id',
    { onRequest: sessionAuth },
    async (req, reply) => {
      const job = store.get(req.params.id)
      if (!job || !visibleTo(job, req)) return reply.code(404).send({ error: 'job not found' })
      return job
    },
  )

  app.post<{ Params: { id: string } }>(
    '/api/jobs/:id/cancel',
    { onRequest: sessionAuth },
    async (req, reply) => {
      const job = store.get(req.params.id)
      if (!job || !visibleTo(job, req)) return reply.code(404).send({ error: 'job not found' })
      try {
        return store.transition(req.params.id, 'canceled')
      } catch (err) {
        if (err instanceof InvalidTransitionError) {
          return reply.code(409).send({ error: err.message })
        }
        throw err
      }
    },
  )
}
