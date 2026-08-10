import { describe, expect, it } from 'vitest'
import { buildApp } from '../app.ts'

describe('first-run setup', () => {
  it('reports setup needed and locks worker endpoints until configured', async () => {
    const app = buildApp({}, { requireSetup: true })

    const status = await app.inject({ method: 'GET', url: '/api/setup' })
    expect(status.json()).toEqual({ needed: true })

    const locked = await app.inject({ method: 'POST', url: '/api/workers', payload: { name: 'w' } })
    expect(locked.statusCode).toBe(503)
  })

  it('generates a token, then authenticates workers with it', async () => {
    const app = buildApp({}, { requireSetup: true })

    const setup = await app.inject({ method: 'POST', url: '/api/setup', payload: {} })
    expect(setup.statusCode).toBe(201)
    const token = setup.json().workerToken as string
    expect(token).toMatch(/^[0-9a-f]{64}$/)

    expect((await app.inject({ method: 'GET', url: '/api/setup' })).json()).toEqual({
      needed: false,
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

  it('accepts a caller-provided token and refuses reconfiguration', async () => {
    const app = buildApp({}, { requireSetup: true })

    const setup = await app.inject({
      method: 'POST',
      url: '/api/setup',
      payload: { workerToken: 'my-own-token-value' },
    })
    expect(setup.json().workerToken).toBe('my-own-token-value')

    const again = await app.inject({ method: 'POST', url: '/api/setup', payload: {} })
    expect(again.statusCode).toBe(409)
  })

  it('rejects short caller-provided tokens', async () => {
    const app = buildApp({}, { requireSetup: true })
    const res = await app.inject({ method: 'POST', url: '/api/setup', payload: { workerToken: 'short' } })
    expect(res.statusCode).toBe(400)
  })

  it('is a no-op when the token comes from the environment', async () => {
    const app = buildApp({}, { requireSetup: true, workerToken: 'from-env' })

    expect((await app.inject({ method: 'GET', url: '/api/setup' })).json()).toEqual({
      needed: false,
    })
    expect((await app.inject({ method: 'POST', url: '/api/setup', payload: {} })).statusCode).toBe(
      409,
    )

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
    })
    const open = await app.inject({ method: 'POST', url: '/api/workers', payload: { name: 'w' } })
    expect(open.statusCode).toBe(201)
  })
})
