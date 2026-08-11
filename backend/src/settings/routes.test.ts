import { describe, expect, it } from 'vitest'
import { buildApp } from '../app.ts'

const ADMIN = { username: 'admin', password: 'password123' }

describe('first-run setup', () => {
  it('reports setup needed and locks worker endpoints until configured', async () => {
    const app = buildApp({}, { requireSetup: true })

    const status = await app.inject({ method: 'GET', url: '/api/setup' })
    expect(status.json()).toEqual({ needed: true, workerTokenNeeded: true, adminNeeded: true })

    const locked = await app.inject({ method: 'POST', url: '/api/workers', payload: { name: 'w' } })
    expect(locked.statusCode).toBe(503)
  })

  it('generates a token, creates the admin, then authenticates workers', async () => {
    const app = buildApp({}, { requireSetup: true })

    const setup = await app.inject({ method: 'POST', url: '/api/setup', payload: { ...ADMIN } })
    expect(setup.statusCode).toBe(201)
    const token = setup.json().workerToken as string
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    // The new admin is signed in immediately.
    expect(setup.headers['set-cookie']).toMatch(/^latentforge_session=/)

    expect((await app.inject({ method: 'GET', url: '/api/setup' })).json()).toEqual({
      needed: false,
      workerTokenNeeded: false,
      adminNeeded: false,
    })

    const noAuth = await app.inject({ method: 'POST', url: '/api/workers', payload: { name: 'w' } })
    expect(noAuth.statusCode).toBe(401)

    const authed = await app.inject({
      method: 'POST',
      url: '/api/workers',
      payload: { name: 'w' },
      headers: { authorization: `Bearer ${token}` },
    })
    expect(authed.statusCode).toBe(201)
  })

  it('refuses setup without admin credentials when auth is enabled', async () => {
    const app = buildApp({}, { requireSetup: true })
    const res = await app.inject({ method: 'POST', url: '/api/setup', payload: {} })
    expect(res.statusCode).toBe(400)
  })

  it('accepts a caller-provided token and refuses reconfiguration', async () => {
    const app = buildApp({}, { requireSetup: true })

    const setup = await app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { workerToken: 'my-own-token-value', ...ADMIN },
    })
    expect(setup.json().workerToken).toBe('my-own-token-value')

    const again = await app.inject({ method: 'POST', url: '/api/setup', payload: { ...ADMIN } })
    expect(again.statusCode).toBe(409)
  })

  it('rejects short caller-provided tokens', async () => {
    const app = buildApp({}, { requireSetup: true })
    const res = await app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { workerToken: 'short', ...ADMIN },
    })
    expect(res.statusCode).toBe(400)
  })

  it('only bootstraps the admin when the token comes from the environment', async () => {
    const app = buildApp({}, { requireSetup: true, workerToken: 'from-env' })

    expect((await app.inject({ method: 'GET', url: '/api/setup' })).json()).toEqual({
      needed: true,
      workerTokenNeeded: false,
      adminNeeded: true,
    })

    const setup = await app.inject({ method: 'POST', url: '/api/setup', payload: { ...ADMIN } })
    expect(setup.statusCode).toBe(201)
    // Env token is never echoed back through setup.
    expect(setup.json().workerToken).toBeUndefined()

    const authed = await app.inject({
      method: 'POST',
      url: '/api/workers',
      payload: { name: 'w' },
      headers: { authorization: 'Bearer from-env' },
    })
    expect(authed.statusCode).toBe(201)
  })

  it('stays open in dev mode without nagging for setup', async () => {
    const app = buildApp()
    expect((await app.inject({ method: 'GET', url: '/api/setup' })).json()).toEqual({
      needed: false,
      workerTokenNeeded: false,
      adminNeeded: false,
    })
    const open = await app.inject({ method: 'POST', url: '/api/workers', payload: { name: 'w' } })
    expect(open.statusCode).toBe(201)
  })
})
