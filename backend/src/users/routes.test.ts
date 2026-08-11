import { describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.ts'

const WORKER_TOKEN = 'worker-token-for-tests'

/** App with auth on, bootstrapped admin, and the admin's session cookie. */
async function authedApp(): Promise<{ app: FastifyInstance; adminCookie: string }> {
  const app = buildApp({}, { requireSetup: true, workerToken: WORKER_TOKEN })
  const setup = await app.inject({
    method: 'POST',
    url: '/api/setup',
    payload: { username: 'admin', password: 'password123' },
  })
  return { app, adminCookie: extractCookie(setup.headers['set-cookie']) }
}

function extractCookie(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header
  const match = raw?.match(/latentforge_session=([^;]+)/)
  if (!match?.[1]) throw new Error(`no session cookie in: ${raw}`)
  return `latentforge_session=${match[1]}`
}

async function login(app: FastifyInstance, username: string, password: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  })
  expect(res.statusCode).toBe(200)
  return extractCookie(res.headers['set-cookie'])
}

async function createUser(
  app: FastifyInstance,
  adminCookie: string,
  body: Record<string, unknown>,
): Promise<{ id: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/users',
    payload: body,
    headers: { cookie: adminCookie },
  })
  expect(res.statusCode).toBe(201)
  return res.json()
}

describe('login and sessions', () => {
  it('logs in, reports identity via me, and logs out', async () => {
    const { app } = await authedApp()

    const anon = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(anon.json()).toMatchObject({ authRequired: true, authenticated: false, user: null })

    const cookie = await login(app, 'admin', 'password123')
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })
    expect(me.json().authenticated).toBe(true)
    expect(me.json().user).toMatchObject({ username: 'admin', role: 'admin' })

    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } })
    expect(out.headers['set-cookie']).toMatch(/Max-Age=0/)
    const after = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })
    expect(after.json().authenticated).toBe(false)
  })

  it('rejects bad credentials and disabled accounts', async () => {
    const { app, adminCookie } = await authedApp()
    const bob = await createUser(app, adminCookie, { username: 'bob', password: 'password123' })

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'bob', password: 'nope' },
    })
    expect(wrong.statusCode).toBe(401)

    const cookie = await login(app, 'bob', 'password123')
    await app.inject({
      method: 'PATCH',
      url: `/api/users/${bob.id}`,
      payload: { disabled: true },
      headers: { cookie: adminCookie },
    })
    // Disabling kills live sessions and future logins.
    const gated = await app.inject({ method: 'GET', url: '/api/jobs', headers: { cookie } })
    expect(gated.statusCode).toBe(401)
    const relogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'bob', password: 'password123' },
    })
    expect(relogin.statusCode).toBe(401)
  })

  it('gates UI routes with 401 and reports 503 before setup', async () => {
    const fresh = buildApp({}, { requireSetup: true })
    expect((await fresh.inject({ method: 'GET', url: '/api/jobs' })).statusCode).toBe(503)

    const { app } = await authedApp()
    for (const url of ['/api/jobs', '/api/workers', '/api/users', '/api/assets/x.png']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401)
    }
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200)
  })

  it('stays open when auth is disabled (dev mode)', async () => {
    const app = buildApp()
    const me = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(me.json()).toEqual({ authRequired: false, authenticated: true, user: null })
    expect((await app.inject({ method: 'GET', url: '/api/jobs' })).statusCode).toBe(200)
    const noLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'x', password: 'y' },
    })
    expect(noLogin.statusCode).toBe(409)
  })
})

describe('user management', () => {
  it('lets admins create, update, and list users; non-admins get 403', async () => {
    const { app, adminCookie } = await authedApp()
    const bob = await createUser(app, adminCookie, {
      username: 'bob',
      password: 'password123',
      tags: ['nsfw'],
    })

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/users/${bob.id}`,
      payload: { tags: ['beta'], role: 'user' },
      headers: { cookie: adminCookie },
    })
    expect(updated.json()).toMatchObject({ username: 'bob', tags: ['beta'] })

    const list = await app.inject({ method: 'GET', url: '/api/users', headers: { cookie: adminCookie } })
    expect(list.json().users).toHaveLength(2)

    const bobCookie = await login(app, 'bob', 'password123')
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { cookie: bobCookie },
    })
    expect(forbidden.statusCode).toBe(403)
  })

  it('rejects duplicate usernames and protects the last admin', async () => {
    const { app, adminCookie } = await authedApp()
    const dupe = await app.inject({
      method: 'POST',
      url: '/api/users',
      payload: { username: 'admin', password: 'password123' },
      headers: { cookie: adminCookie },
    })
    expect(dupe.statusCode).toBe(409)

    const admins = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { cookie: adminCookie },
    })
    const adminId = admins.json().users[0].id as string
    const demote = await app.inject({
      method: 'PATCH',
      url: `/api/users/${adminId}`,
      payload: { role: 'user' },
      headers: { cookie: adminCookie },
    })
    expect(demote.statusCode).toBe(409)
  })
})

describe('per-user model access', () => {
  async function withModels() {
    const { app, adminCookie } = await authedApp()
    await app.inject({
      method: 'POST',
      url: '/api/workers',
      payload: { name: 'gpu-1', models: ['sdxl-1.0', 'spicy-xl'] },
      headers: { authorization: `Bearer ${WORKER_TOKEN}` },
    })
    await app.inject({
      method: 'PUT',
      url: '/api/model-tags/spicy-xl',
      payload: { tags: ['nsfw'] },
      headers: { cookie: adminCookie },
    })
    return { app, adminCookie }
  }

  it('enforces access at job creation, not just in the picker', async () => {
    const { app, adminCookie } = await withModels()
    await createUser(app, adminCookie, { username: 'bob', password: 'password123' })
    const bobCookie = await login(app, 'bob', 'password123')

    const denied = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { prompt: 'x', model: 'spicy-xl' },
      headers: { cookie: bobCookie },
    })
    expect(denied.statusCode).toBe(403)

    const allowed = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { prompt: 'x', model: 'sdxl-1.0' },
      headers: { cookie: bobCookie },
    })
    expect(allowed.statusCode).toBe(201)

    const asAdmin = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { prompt: 'x', model: 'spicy-xl' },
      headers: { cookie: adminCookie },
    })
    expect(asAdmin.statusCode).toBe(201)
  })

  it('honours tag grants and filters the worker model list per user', async () => {
    const { app, adminCookie } = await withModels()
    const bob = await createUser(app, adminCookie, { username: 'bob', password: 'password123' })
    const bobCookie = await login(app, 'bob', 'password123')

    const before = await app.inject({
      method: 'GET',
      url: '/api/workers',
      headers: { cookie: bobCookie },
    })
    expect(before.json().workers[0].models).toEqual(['sdxl-1.0'])

    await app.inject({
      method: 'PATCH',
      url: `/api/users/${bob.id}`,
      payload: { tags: ['nsfw'] },
      headers: { cookie: adminCookie },
    })
    const granted = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: { prompt: 'x', model: 'spicy-xl' },
      headers: { cookie: bobCookie },
    })
    expect(granted.statusCode).toBe(201)

    const admin = await app.inject({
      method: 'GET',
      url: '/api/workers',
      headers: { cookie: adminCookie },
    })
    expect(admin.json().workers[0].models).toEqual(['sdxl-1.0', 'spicy-xl'])
  })
})

describe('per-user job scoping', () => {
  it('users see and cancel only their own jobs; admins see all', async () => {
    const { app, adminCookie } = await authedApp()
    await createUser(app, adminCookie, { username: 'bob', password: 'password123' })
    const bobCookie = await login(app, 'bob', 'password123')

    const bobJob = (
      await app.inject({
        method: 'POST',
        url: '/api/jobs',
        payload: { prompt: 'bob job' },
        headers: { cookie: bobCookie },
      })
    ).json()
    const adminJob = (
      await app.inject({
        method: 'POST',
        url: '/api/jobs',
        payload: { prompt: 'admin job' },
        headers: { cookie: adminCookie },
      })
    ).json()

    const bobList = await app.inject({ method: 'GET', url: '/api/jobs', headers: { cookie: bobCookie } })
    expect(bobList.json().jobs.map((j: { id: string }) => j.id)).toEqual([bobJob.id])
    const adminList = await app.inject({
      method: 'GET',
      url: '/api/jobs',
      headers: { cookie: adminCookie },
    })
    expect(adminList.json().jobs).toHaveLength(2)

    // Foreign jobs 404 rather than 403 — ids aren't confirmed to other users.
    const peek = await app.inject({
      method: 'GET',
      url: `/api/jobs/${adminJob.id}`,
      headers: { cookie: bobCookie },
    })
    expect(peek.statusCode).toBe(404)
    const cancelForeign = await app.inject({
      method: 'POST',
      url: `/api/jobs/${adminJob.id}/cancel`,
      headers: { cookie: bobCookie },
    })
    expect(cancelForeign.statusCode).toBe(404)

    const cancelOwn = await app.inject({
      method: 'POST',
      url: `/api/jobs/${bobJob.id}/cancel`,
      headers: { cookie: bobCookie },
    })
    expect(cancelOwn.statusCode).toBe(200)
    const cancelAsAdmin = await app.inject({
      method: 'POST',
      url: `/api/jobs/${adminJob.id}/cancel`,
      headers: { cookie: adminCookie },
    })
    expect(cancelAsAdmin.statusCode).toBe(200)
  })
})
