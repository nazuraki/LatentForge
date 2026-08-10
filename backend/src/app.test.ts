import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.ts'

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })
})

describe('static frontend serving', () => {
  it('serves index.html with SPA fallback while keeping API 404s JSON', async () => {
    const staticDir = mkdtempSync(join(tmpdir(), 'latentforge-static-'))
    writeFileSync(join(staticDir, 'index.html'), '<html>latentforge</html>')
    const app = buildApp({}, { staticDir })

    const root = await app.inject({ method: 'GET', url: '/' })
    expect(root.statusCode).toBe(200)
    expect(root.body).toContain('latentforge')

    const spaRoute = await app.inject({ method: 'GET', url: '/jobs/some-client-route' })
    expect(spaRoute.statusCode).toBe(200)
    expect(spaRoute.body).toContain('latentforge')

    const apiMiss = await app.inject({ method: 'GET', url: '/api/nope' })
    expect(apiMiss.statusCode).toBe(404)
    expect(apiMiss.json()).toEqual({ error: 'not found' })
  })

  it('is inert when the static dir does not exist', async () => {
    const app = buildApp({}, { staticDir: '/nonexistent/dist' })
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(404)
  })
})
