import { describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.ts'
import { FakeUsr, USR_URL } from '../test-sso.ts'

const WORKER_TOKEN = 'worker-token-for-tests'

/** App with usr SSO on (fake usr), the worker token from env, and an admin cookie. */
function ssoApp(): { app: FastifyInstance; usr: FakeUsr; adminCookie: string } {
  const usr = new FakeUsr()
  const app = buildApp({}, { requireSetup: true, workerToken: WORKER_TOKEN, sso: usr.verifier() })
  return { app, usr, adminCookie: usr.cookie('admin@example.com', ['admin']) }
}

describe('auth gate', () => {
  it('reports status via me: anonymous, no-role identity, and a granted user', async () => {
    const { app, usr } = ssoApp()

    const anon = await app.inject({ method: 'GET', url: '/api/auth/me?return=https://lf.example.internal/' })
    expect(anon.json()).toEqual({
      authRequired: true,
      authenticated: false,
      user: null,
      identity: null,
      sso: {
        usrUrl: USR_URL,
        app: 'latentforge',
        refreshUrl: `${USR_URL}/api/auth/sso/refresh?return=https%3A%2F%2Flf.example.internal%2F`,
      },
    })

    const noRole = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: usr.cookie('nobody@example.com', []) },
    })
    expect(noRole.json()).toMatchObject({
      authenticated: false,
      user: null,
      identity: { email: 'nobody@example.com', roles: [] },
      sso: { refreshUrl: null },
    })

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: usr.cookie('bob@example.com', ['nsfw']) },
    })
    expect(me.json()).toMatchObject({
      authenticated: true,
      user: { id: 'bob@example.com', username: 'bob@example.com', role: 'user', tags: ['nsfw'] },
    })
  })

  it('gates browser routes: 401 without identity, 403 without a latentforge role', async () => {
    const { app, usr, adminCookie } = ssoApp()
    for (const url of ['/api/jobs', '/api/workers', '/api/model-tags', '/api/assets/x.png']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401)
      const forbidden = await app.inject({
        method: 'GET',
        url,
        headers: { cookie: usr.cookie('nobody@example.com', []) },
      })
      expect(forbidden.statusCode).toBe(403)
    }
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200)
    const jobs = await app.inject({ method: 'GET', url: '/api/jobs', headers: { cookie: adminCookie } })
    expect(jobs.statusCode).toBe(200)
  })

  it('rejects forged and expired cookies', async () => {
    const { app, usr } = ssoApp()
    const impostor = new FakeUsr()
    const forged = await app.inject({
      method: 'GET',
      url: '/api/jobs',
      headers: { cookie: impostor.cookie('admin@example.com', ['admin']) },
    })
    expect(forged.statusCode).toBe(401)
    const expired = await app.inject({
      method: 'GET',
      url: '/api/jobs',
      headers: {
        cookie: `nz_id=${usr.token('a@example.com', ['latentforge:admin'], { exp: Math.floor(Date.now() / 1000) - 5 })}`,
      },
    })
    expect(expired.statusCode).toBe(401)
  })

  it('stays open when SSO is not configured (dev mode)', async () => {
    const app = buildApp()
    const me = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(me.json()).toEqual({
      authRequired: false,
      authenticated: true,
      user: null,
      sso: null,
      identity: null,
    })
    expect((await app.inject({ method: 'GET', url: '/api/jobs' })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/api/model-tags' })).statusCode).toBe(200)
  })

  it('keeps model-tag administration admin-only', async () => {
    const { app, usr, adminCookie } = ssoApp()
    const user = await app.inject({
      method: 'GET',
      url: '/api/model-tags',
      headers: { cookie: usr.cookie('bob@example.com', ['user']) },
    })
    expect(user.statusCode).toBe(403)
    const admin = await app.inject({ method: 'GET', url: '/api/model-tags', headers: { cookie: adminCookie } })
    expect(admin.json()).toEqual({ models: {} })
  })
})

describe('per-user model access', () => {
  async function withModels() {
    const ctx = ssoApp()
    await ctx.app.inject({
      method: 'POST',
      url: '/api/workers',
      payload: { name: 'gpu-1', models: ['sdxl-1.0', 'spicy-xl'] },
      headers: { authorization: `Bearer ${WORKER_TOKEN}` },
    })
    const tagged = await ctx.app.inject({
      method: 'PUT',
      url: '/api/model-tags/spicy-xl',
      payload: { tags: ['nsfw'] },
      headers: { cookie: ctx.adminCookie },
    })
    expect(tagged.json()).toEqual({ model: 'spicy-xl', tags: ['nsfw'] })
    return ctx
  }

  it('enforces access at job creation, not just in the picker', async () => {
    const { app, usr } = await withModels()
    const bob = usr.cookie('bob@example.com', ['user'])

    const denied = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { prompt: 'x', model: 'spicy-xl' },
      headers: { cookie: bob },
    })
    expect(denied.statusCode).toBe(403)

    const allowed = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { prompt: 'x', model: 'sdxl-1.0' },
      headers: { cookie: bob },
    })
    expect(allowed.statusCode).toBe(201)
    expect(allowed.json().userId).toBe('bob@example.com')
  })

  it('treats latentforge roles as tag grants and filters the worker model list', async () => {
    const { app, usr, adminCookie } = await withModels()

    const plain = await app.inject({
      method: 'GET',
      url: '/api/workers',
      headers: { cookie: usr.cookie('bob@example.com', ['user']) },
    })
    expect(plain.json().workers[0].models).toEqual(['sdxl-1.0'])

    const granted = await app.inject({
      method: 'GET',
      url: '/api/workers',
      headers: { cookie: usr.cookie('bob@example.com', ['user', 'nsfw']) },
    })
    expect(granted.json().workers[0].models).toEqual(['sdxl-1.0', 'spicy-xl'])

    const admin = await app.inject({ method: 'GET', url: '/api/workers', headers: { cookie: adminCookie } })
    expect(admin.json().workers[0].models).toEqual(['sdxl-1.0', 'spicy-xl'])
  })
})

describe('per-user job scoping', () => {
  it('users see and cancel only their own jobs; admins see all', async () => {
    const { app, usr, adminCookie } = ssoApp()
    const bob = usr.cookie('bob@example.com', ['user'])
    const eve = usr.cookie('eve@example.com', ['user'])

    const bobJob = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { prompt: 'bob' },
      headers: { cookie: bob },
    })
    await app.inject({ method: 'POST', url: '/api/jobs', payload: { prompt: 'eve' }, headers: { cookie: eve } })
    const id = bobJob.json().id as string

    const bobList = await app.inject({ method: 'GET', url: '/api/jobs', headers: { cookie: bob } })
    expect(bobList.json().jobs.map((j: { request: { prompt: string } }) => j.request.prompt)).toEqual(['bob'])
    const adminList = await app.inject({ method: 'GET', url: '/api/jobs', headers: { cookie: adminCookie } })
    expect(adminList.json().jobs).toHaveLength(2)

    const eveGet = await app.inject({ method: 'GET', url: `/api/jobs/${id}`, headers: { cookie: eve } })
    expect(eveGet.statusCode).toBe(404)
    const eveCancel = await app.inject({
      method: 'POST',
      url: `/api/jobs/${id}/cancel`,
      headers: { cookie: eve },
    })
    expect(eveCancel.statusCode).toBe(404)
    const bobCancel = await app.inject({
      method: 'POST',
      url: `/api/jobs/${id}/cancel`,
      headers: { cookie: bob },
    })
    expect(bobCancel.statusCode).toBe(200)
  })
})
