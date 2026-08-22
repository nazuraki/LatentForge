import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto'
import { SsoVerifier, type SsoConfig } from './sso.ts'

/**
 * Test double for usr: a local ES256 signing key, a JWKS served through a
 * mocked fetch, and a token minter. Lets route tests exercise real signature
 * verification without a usr instance.
 */

export const USR_URL = 'https://usr.example.internal'
export const SSO_CONFIG: SsoConfig = { usrUrl: USR_URL, app: 'latentforge' }

const b64url = (input: Buffer | string): string => Buffer.from(input).toString('base64url')

export class FakeUsr {
  readonly kid = 'test-key-1'
  private readonly privateKey: KeyObject
  private readonly publicKey: KeyObject
  /** How many JWKS fetches the verifier made (cache behaviour). */
  jwksFetches = 0

  constructor() {
    const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    this.privateKey = pair.privateKey
    this.publicKey = pair.publicKey
  }

  /** Compact ES256 JWS with usr's claim shape; roles are qualified `app:role`. */
  token(
    sub: string,
    roles: string[],
    overrides: Record<string, unknown> = {},
    kid: string = this.kid,
  ): string {
    const now = Math.floor(Date.now() / 1000)
    const claims = { iss: 'usr', sub, sid: 'sid', iat: now, exp: now + 1800, roles, ...overrides }
    const header = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid }))
    const payload = b64url(JSON.stringify(claims))
    const signer = createSign('SHA256')
    signer.update(`${header}.${payload}`)
    return `${header}.${payload}.${b64url(signer.sign({ key: this.privateKey, dsaEncoding: 'ieee-p1363' }))}`
  }

  /** `cookie` header value carrying a freshly minted nz_id for these latentforge roles. */
  cookie(email: string, roles: string[]): string {
    return `nz_id=${this.token(email, roles.map((r) => `latentforge:${r}`))}`
  }

  fetch: typeof fetch = async (input) => {
    if (String(input) !== `${USR_URL}/.well-known/jwks.json`) return new Response('nope', { status: 404 })
    this.jwksFetches++
    const jwk = this.publicKey.export({ format: 'jwk' })
    return Response.json({ keys: [{ ...jwk, kid: this.kid, alg: 'ES256', use: 'sig' }] })
  }

  verifier(now: () => number = Date.now): SsoVerifier {
    return new SsoVerifier(SSO_CONFIG, this.fetch, now)
  }
}
