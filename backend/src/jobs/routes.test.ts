import { describe, expect, it } from 'vitest'
import { buildApp } from '../app.ts'

describe('jobs API', () => {
  it('creates a job and fetches it back', async () => {
    const app = buildApp()
    const created = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { prompt: 'a red fox', model: 'sdxl-1.0', seed: 42 },
    })
    expect(created.statusCode).toBe(201)
    const job = created.json()
    expect(job.status).toBe('queued')

    const fetched = await app.inject({ method: 'GET', url: `/api/jobs/${job.id}` })
    expect(fetched.statusCode).toBe(200)
    expect(fetched.json()).toEqual(job)
  })

  it('rejects a job without a prompt', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: { seed: 1 } })
    expect(res.statusCode).toBe(400)
  })

  it('rejects unknown body fields', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { prompt: 'x', bogus: true },
    })
    expect(res.statusCode).toBe(400)
  })

  it('lists jobs with an optional status filter', async () => {
    const app = buildApp()
    await app.inject({ method: 'POST', url: '/api/jobs', payload: { prompt: 'x' } })
    const all = await app.inject({ method: 'GET', url: '/api/jobs' })
    expect(all.json().jobs).toHaveLength(1)
    const none = await app.inject({ method: 'GET', url: '/api/jobs?status=running' })
    expect(none.json().jobs).toHaveLength(0)
    const bad = await app.inject({ method: 'GET', url: '/api/jobs?status=bogus' })
    expect(bad.statusCode).toBe(400)
  })

  it('cancels a queued job, then refuses to cancel it again', async () => {
    const app = buildApp()
    const created = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { prompt: 'x' },
    })
    const id = created.json().id
    const canceled = await app.inject({ method: 'POST', url: `/api/jobs/${id}/cancel` })
    expect(canceled.statusCode).toBe(200)
    expect(canceled.json().status).toBe('canceled')
    const again = await app.inject({ method: 'POST', url: `/api/jobs/${id}/cancel` })
    expect(again.statusCode).toBe(409)
  })

  it('404s on unknown job ids', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/jobs/nope' })
    expect(res.statusCode).toBe(404)
  })
})
