import { describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.ts'

async function registerWorker(app: FastifyInstance, name = 'gpu-1'): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/workers', payload: { name } })
  return res.json().id
}

async function createJob(app: FastifyInstance, prompt: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: { prompt } })
  return res.json().id
}

describe('workers API', () => {
  it('registers and lists workers', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/workers',
      payload: { name: 'gpu-1', models: ['sdxl-1.0'] },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().online).toBe(true)
    const list = await app.inject({ method: 'GET', url: '/api/workers' })
    expect(list.json().workers).toHaveLength(1)
  })

  it('rejects registration without a name', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/api/workers', payload: {} })
    expect(res.statusCode).toBe(400)
  })

  it('claims jobs oldest-first and 204s when the queue is empty', async () => {
    const app = buildApp()
    const workerId = await registerWorker(app)
    const first = await createJob(app, 'first')
    const second = await createJob(app, 'second')

    const claim1 = await app.inject({ method: 'POST', url: `/api/workers/${workerId}/claim` })
    expect(claim1.statusCode).toBe(200)
    expect(claim1.json()).toMatchObject({ id: first, status: 'running', workerId })

    const claim2 = await app.inject({ method: 'POST', url: `/api/workers/${workerId}/claim` })
    expect(claim2.json().id).toBe(second)

    const claim3 = await app.inject({ method: 'POST', url: `/api/workers/${workerId}/claim` })
    expect(claim3.statusCode).toBe(204)
  })

  it('runs the full lifecycle: claim then report success', async () => {
    const app = buildApp()
    const workerId = await registerWorker(app)
    const jobId = await createJob(app, 'a red fox')
    await app.inject({ method: 'POST', url: `/api/workers/${workerId}/claim` })

    const res = await app.inject({
      method: 'POST',
      url: `/api/workers/${workerId}/jobs/${jobId}/result`,
      payload: { status: 'succeeded' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('succeeded')
  })

  it('records failure with an error message', async () => {
    const app = buildApp()
    const workerId = await registerWorker(app)
    const jobId = await createJob(app, 'x')
    await app.inject({ method: 'POST', url: `/api/workers/${workerId}/claim` })

    const res = await app.inject({
      method: 'POST',
      url: `/api/workers/${workerId}/jobs/${jobId}/result`,
      payload: { status: 'failed', error: 'CUDA OOM' },
    })
    expect(res.json()).toMatchObject({ status: 'failed', error: 'CUDA OOM' })
  })

  it('rejects results from a worker the job is not assigned to', async () => {
    const app = buildApp()
    const owner = await registerWorker(app, 'gpu-1')
    const other = await registerWorker(app, 'gpu-2')
    const jobId = await createJob(app, 'x')
    await app.inject({ method: 'POST', url: `/api/workers/${owner}/claim` })

    const res = await app.inject({
      method: 'POST',
      url: `/api/workers/${other}/jobs/${jobId}/result`,
      payload: { status: 'succeeded' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('409s when reporting a result for a job canceled mid-flight', async () => {
    const app = buildApp()
    const workerId = await registerWorker(app)
    const jobId = await createJob(app, 'x')
    await app.inject({ method: 'POST', url: `/api/workers/${workerId}/claim` })
    await app.inject({ method: 'POST', url: `/api/jobs/${jobId}/cancel` })

    const res = await app.inject({
      method: 'POST',
      url: `/api/workers/${workerId}/jobs/${jobId}/result`,
      payload: { status: 'succeeded' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('404s for unknown workers on heartbeat, claim, and result', async () => {
    const app = buildApp()
    for (const url of [
      '/api/workers/nope/heartbeat',
      '/api/workers/nope/claim',
    ]) {
      const res = await app.inject({ method: 'POST', url })
      expect(res.statusCode).toBe(404)
    }
    const res = await app.inject({
      method: 'POST',
      url: '/api/workers/nope/jobs/also-nope/result',
      payload: { status: 'succeeded' },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('worker endpoint auth', () => {
  const tokenApp = () => buildApp({}, { workerToken: 'secret' })

  it('rejects registration without or with a wrong token', async () => {
    const app = tokenApp()
    const noHeader = await app.inject({
      method: 'POST',
      url: '/api/workers',
      payload: { name: 'gpu-1' },
    })
    expect(noHeader.statusCode).toBe(401)
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/workers',
      payload: { name: 'gpu-1' },
      headers: { authorization: 'Bearer nope' },
    })
    expect(wrong.statusCode).toBe(401)
  })

  it('accepts worker calls with the token; worker list stays open', async () => {
    const app = tokenApp()
    const headers = { authorization: 'Bearer secret' }
    const res = await app.inject({
      method: 'POST',
      url: '/api/workers',
      payload: { name: 'gpu-1' },
      headers,
    })
    expect(res.statusCode).toBe(201)
    const heartbeat = await app.inject({
      method: 'POST',
      url: `/api/workers/${res.json().id}/heartbeat`,
      headers,
    })
    expect(heartbeat.statusCode).toBe(200)
    const list = await app.inject({ method: 'GET', url: '/api/workers' })
    expect(list.statusCode).toBe(200)
  })
})
