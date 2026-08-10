import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.ts'

// 1x1 transparent PNG
const PIXEL_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function testApp(): FastifyInstance {
  return buildApp({}, { dataDir: mkdtempSync(join(tmpdir(), 'latentforge-assets-')) })
}

async function runJob(app: FastifyInstance): Promise<{ workerId: string; jobId: string }> {
  const worker = await app.inject({ method: 'POST', url: '/api/workers', payload: { name: 'w' } })
  const workerId = worker.json().id
  const job = await app.inject({ method: 'POST', url: '/api/jobs', payload: { prompt: 'x' } })
  const jobId = job.json().id
  await app.inject({ method: 'POST', url: `/api/workers/${workerId}/claim` })
  return { workerId, jobId }
}

describe('job results with images', () => {
  it('stores images from a result and serves them back', async () => {
    const app = testApp()
    const { workerId, jobId } = await runJob(app)

    const result = await app.inject({
      method: 'POST',
      url: `/api/workers/${workerId}/jobs/${jobId}/result`,
      payload: { status: 'succeeded', images: [PIXEL_B64], seed: 42 },
    })
    expect(result.statusCode).toBe(200)
    expect(result.json().output).toEqual({
      images: [`/api/assets/${jobId}-0.png`],
      seed: 42,
    })

    const asset = await app.inject({ method: 'GET', url: `/api/assets/${jobId}-0.png` })
    expect(asset.statusCode).toBe(200)
    expect(asset.headers['content-type']).toBe('image/png')
    expect(asset.rawPayload.equals(Buffer.from(PIXEL_B64, 'base64'))).toBe(true)
  })

  it('succeeds without images, leaving output unset', async () => {
    const app = testApp()
    const { workerId, jobId } = await runJob(app)
    const result = await app.inject({
      method: 'POST',
      url: `/api/workers/${workerId}/jobs/${jobId}/result`,
      payload: { status: 'succeeded' },
    })
    expect(result.json().output).toBeUndefined()
  })

  it('does not write assets when the job was canceled mid-flight', async () => {
    const app = testApp()
    const { workerId, jobId } = await runJob(app)
    await app.inject({ method: 'POST', url: `/api/jobs/${jobId}/cancel` })
    const result = await app.inject({
      method: 'POST',
      url: `/api/workers/${workerId}/jobs/${jobId}/result`,
      payload: { status: 'succeeded', images: [PIXEL_B64] },
    })
    expect(result.statusCode).toBe(409)
    const asset = await app.inject({ method: 'GET', url: `/api/assets/${jobId}-0.png` })
    expect(asset.statusCode).toBe(404)
  })

  it('404s for unknown and unsafe asset names', async () => {
    const app = testApp()
    for (const name of ['nope.png', '..%2F..%2Fsecrets.png', 'no-extension', 'x.txt']) {
      const res = await app.inject({ method: 'GET', url: `/api/assets/${name}` })
      expect(res.statusCode).toBe(404)
    }
  })
})
