import { createPublicKey, createVerify, type JsonWebKey, type KeyObject } from 'node:crypto'

/**
 * Verifier for usr's cross-app SSO cookie (`nz_id`): a short-lived ES256 JWT
 * that usr sets on the shared parent domain after login. Verified offline
 * against usr's JWKS (cached; refetched on an unknown `kid`) and authorized
 * from the `roles` claim — qualified `app:role` strings, of which ours are the
 * `<app>:` ones. node:crypto only, no dependencies. Same contract as the other
 * nazu siblings (usr's docs/sso-verifier.md).
 */

export const SSO_COOKIE = 'nz_id'
const JWKS_TTL_MS = 5 * 60 * 1000

export interface SsoConfig {
  /** Public base URL of usr (browser redirects + JWKS fetch), no trailing slash. */
  usrUrl: string
  /** Our app name in usr — the `<app>:` role prefix that grants access. */
  app: string
}

export interface Identity {
  email: string
  /** Our app's roles, unqualified (e.g. `admin`, `nsfw`). */
  roles: string[]
}

type Jwk = JsonWebKey & { kid?: string }

interface CachedKey {
  kid: string
  key: KeyObject
}

/** Config from env; null when SSO is off (LATENTFORGE_USR_URL unset). */
export function ssoConfig(env: NodeJS.ProcessEnv = process.env): SsoConfig | null {
  const usrUrl = env.LATENTFORGE_USR_URL?.trim().replace(/\/+$/, '')
  if (!usrUrl) return null
  return { usrUrl, app: env.LATENTFORGE_USR_APP?.trim() || 'latentforge' }
}

export class SsoVerifier {
  readonly config: SsoConfig
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private keys: CachedKey[] = []
  private fetchedAt = 0

  constructor(config: SsoConfig, fetchImpl: typeof fetch = fetch, now: () => number = Date.now) {
    this.config = config
    this.fetchImpl = fetchImpl
    this.now = now
  }

  /** usr endpoint that re-mints `nz_id` (or shows usr's login) and returns the browser. */
  refreshUrl(returnTo: string): string {
    return `${this.config.usrUrl}/api/auth/sso/refresh?return=${encodeURIComponent(returnTo)}`
  }

  /**
   * Verify the cookie and return the identity plus its roles for our app.
   * Null on any failure (missing, malformed, bad signature, wrong issuer,
   * expired, JWKS unreachable). Never throws.
   */
  async verify(token: string | undefined): Promise<Identity | null> {
    if (!token) return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [h, p, s] = parts as [string, string, string]
    let header: { alg?: string; kid?: string }
    let claims: { iss?: string; sub?: string; exp?: number; roles?: unknown }
    try {
      header = JSON.parse(Buffer.from(h, 'base64url').toString())
      claims = JSON.parse(Buffer.from(p, 'base64url').toString())
    } catch {
      return null
    }
    if (header.alg !== 'ES256' || !header.kid) return null

    const key = await this.keyFor(header.kid)
    if (!key) return null
    const verifier = createVerify('SHA256')
    verifier.update(`${h}.${p}`)
    try {
      if (!verifier.verify({ key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))) {
        return null
      }
    } catch {
      return null
    }

    if (claims.iss !== 'usr' || typeof claims.sub !== 'string') return null
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= this.now()) return null

    const prefix = `${this.config.app}:`
    const roles = Array.isArray(claims.roles)
      ? claims.roles
          .filter((r): r is string => typeof r === 'string' && r.startsWith(prefix))
          .map((r) => r.slice(prefix.length))
      : []
    return { email: claims.sub, roles }
  }

  private async keyFor(kid: string): Promise<KeyObject | null> {
    const stale = this.now() - this.fetchedAt > JWKS_TTL_MS
    let hit = stale ? undefined : this.keys.find((k) => k.kid === kid)
    if (!hit) {
      await this.refreshKeys()
      hit = this.keys.find((k) => k.kid === kid)
    }
    return hit?.key ?? null
  }

  private async refreshKeys(): Promise<void> {
    try {
      const res = await this.fetchImpl(`${this.config.usrUrl}/.well-known/jwks.json`)
      if (!res.ok) return
      const body = (await res.json()) as { keys?: Jwk[] }
      const next: CachedKey[] = []
      for (const jwk of body.keys ?? []) {
        if (jwk.kty !== 'EC' || !jwk.kid) continue
        try {
          next.push({ kid: jwk.kid, key: createPublicKey({ key: jwk, format: 'jwk' }) })
        } catch {
          /* skip malformed key */
        }
      }
      this.keys = next
      this.fetchedAt = this.now()
    } catch {
      /* unreachable usr: keep the cached keys; verify fails closed on unknown kid */
    }
  }
}
