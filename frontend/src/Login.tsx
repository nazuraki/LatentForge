import { Alert, Button, Card } from '@nazuraki/ui-react'
import { useEffect } from 'react'
import type { AuthStatus } from './api'

/** Set while bouncing to usr so a fruitless round trip doesn't loop forever. */
export const BOUNCE_KEY = 'latentforge_sso_bounce'

function goToUsr(refreshUrl: string) {
  sessionStorage.setItem(BOUNCE_KEY, '1')
  window.location.assign(refreshUrl)
}

interface LoginProps {
  status: AuthStatus
}

/**
 * Shown whenever the API is gated and this browser doesn't authenticate. No
 * identity → bounce to usr's refresh endpoint (which re-mints `nz_id`, or
 * shows usr's login, and returns here); identity without a latentforge role →
 * explain, don't loop. LatentForge has no login form of its own.
 */
export function Login({ status }: LoginProps) {
  const { sso, identity } = status
  const refreshUrl = sso?.refreshUrl ?? null
  const bounced = sessionStorage.getItem(BOUNCE_KEY) !== null
  const autoBounce = Boolean(refreshUrl) && !identity && !bounced

  useEffect(() => {
    if (autoBounce && refreshUrl) goToUsr(refreshUrl)
  }, [autoBounce, refreshUrl])

  if (autoBounce) return null

  return (
    <Card>
      <section aria-labelledby="login-heading">
        <h2 id="login-heading">Sign in</h2>
        {identity ? (
          <>
            <p>
              Signed in as <strong>{identity.email}</strong>, but this account has no{' '}
              <code>{sso?.app ?? 'latentforge'}</code> role in usr.
            </p>
            <p className="muted">Ask an admin to grant one, then reload.</p>
            <div className="form-actions">
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  sessionStorage.removeItem(BOUNCE_KEY)
                  window.location.reload()
                }}
              >
                Reload
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">Sign in through usr to continue.</p>
            {bounced && (
              <Alert variant="warning" className="panel">
                usr sent you back without an identity cookie — check that it is reachable and that
                SSO is enabled for this domain.
              </Alert>
            )}
            <div className="form-actions">
              <Button
                type="button"
                variant="primary"
                onClick={() => refreshUrl && goToUsr(refreshUrl)}
                disabled={!refreshUrl}
              >
                Sign in with usr
              </Button>
            </div>
          </>
        )}
      </section>
    </Card>
  )
}
