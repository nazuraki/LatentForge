import { describe, expect, it } from 'vitest'
import { ssoConfig } from './sso.ts'
import { FakeUsr, USR_URL } from './test-sso.ts'

describe('ssoConfig', () => {
  it('is off without LATENTFORGE_USR_URL and strips trailing slashes', () => {
    expect(ssoConfig({})).toBeNull()
    expect(ssoConfig({ LATENTFORGE_USR_URL: '  ' })).toBeNull()
    expect(ssoConfig({ LATENTFORGE_USR_URL: `${USR_URL}/` })).toEqual({ usrUrl: USR_URL, app: 'latentforge' })
    expect(ssoConfig({ LATENTFORGE_USR_URL: USR_URL, LATENTFORGE_USR_APP: 'lf' })?.app).toBe('lf')
  })
})

describe('SsoVerifier', () => {
  it('verifies a usr token and keeps only our app roles, unqualified', async () => {
    const usr = new FakeUsr()
    const identity = await usr
      .verifier()
      .verify(usr.token('a@example.com', ['latentforge:admin', 'latentforge:nsfw', 'backplane:admin']))
    expect(identity).toEqual({ email: 'a@example.com', roles: ['admin', 'nsfw'] })
  })

  it('rejects missing, malformed, tampered, foreign-issuer, and expired tokens', async () => {
    const usr = new FakeUsr()
    const v = usr.verifier()
    expect(await v.verify(undefined)).toBeNull()
    expect(await v.verify('not.a.jwt.really')).toBeNull()
    expect(await v.verify('garbage')).toBeNull()

    const good = usr.token('a@example.com', ['latentforge:user'])
    const [h, p] = good.split('.')
    const forged = `${h}.${Buffer.from(JSON.stringify({ iss: 'usr', sub: 'x', exp: 9e9, roles: ['latentforge:admin'] })).toString('base64url')}.${good.split('.')[2]}`
    expect(await v.verify(forged)).toBeNull()
    expect(await v.verify(`${h}.${p}.AAAA`)).toBeNull()

    expect(await v.verify(usr.token('a@example.com', [], { iss: 'someone-else' }))).toBeNull()
    expect(await v.verify(usr.token('a@example.com', [], { exp: Math.floor(Date.now() / 1000) - 1 }))).toBeNull()
    expect(await v.verify(usr.token('a@example.com', [], {}, 'unknown-kid'))).toBeNull()
  })

  it('rejects tokens signed by another key even with a matching kid', async () => {
    const usr = new FakeUsr()
    const impostor = new FakeUsr()
    expect(await usr.verifier().verify(impostor.token('a@example.com', ['latentforge:admin']))).toBeNull()
  })

  it('caches the JWKS and refetches on an unknown kid', async () => {
    const usr = new FakeUsr()
    const v = usr.verifier()
    await v.verify(usr.token('a@example.com', ['latentforge:user']))
    await v.verify(usr.token('a@example.com', ['latentforge:user']))
    expect(usr.jwksFetches).toBe(1)
    await v.verify(usr.token('a@example.com', ['latentforge:user'], {}, 'rotated'))
    expect(usr.jwksFetches).toBe(2)
  })

  it('fails closed when usr is unreachable', async () => {
    const usr = new FakeUsr()
    const v = new (await import('./sso.ts')).SsoVerifier(
      { usrUrl: USR_URL, app: 'latentforge' },
      async () => {
        throw new Error('ECONNREFUSED')
      },
    )
    expect(await v.verify(usr.token('a@example.com', ['latentforge:admin']))).toBeNull()
  })

  it('builds the usr refresh URL with the return target encoded', () => {
    const url = new FakeUsr().verifier().refreshUrl('https://latentforge.example.internal/?x=1')
    expect(url).toBe(
      `${USR_URL}/api/auth/sso/refresh?return=https%3A%2F%2Flatentforge.example.internal%2F%3Fx%3D1`,
    )
  })
})
