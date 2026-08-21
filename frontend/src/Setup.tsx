import { Alert, Button, Card, Field, Input } from '@nazuraki/ui-react'
import { useState, type FormEvent } from 'react'
import { completeSetup, type SetupStatus } from './api'

interface SetupProps {
  status: SetupStatus
  onDone: () => void
}

/**
 * First-run setup: creates the initial admin account (which is signed in via
 * cookie) and the worker token (generated unless the user pastes their own).
 * The token is shown exactly once — the server never returns it again.
 */
export function Setup({ status, onDone }: SetupProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [customToken, setCustomToken] = useState('')
  const [token, setToken] = useState<string | undefined>()
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | undefined>()

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(undefined)
    try {
      const res = await completeSetup({
        ...(status.workerTokenNeeded && customToken.trim() ? { workerToken: customToken.trim() } : {}),
        ...(status.adminNeeded ? { username: username.trim(), password } : {}),
      })
      if (res.workerToken) {
        setToken(res.workerToken)
      } else {
        setDone(true)
        onDone()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'setup failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function copyToken() {
    if (!token) return
    await navigator.clipboard.writeText(token)
    setCopied(true)
  }

  if (done) return null

  if (token) {
    return (
      <Card>
        <section aria-labelledby="setup-heading">
          <h2 id="setup-heading">Setup complete</h2>
          <p>
            This is your worker token. It is shown <strong>only once</strong> — copy it now and use
            it to connect workers:
          </p>
          <p>
            <code className="token">{token}</code>
          </p>
          <div className="form-actions">
            <Button type="button" variant="accent" onClick={copyToken}>
              {copied ? 'Copied' : 'Copy token'}
            </Button>
          </div>
          <p>Then start a worker wherever your GPU lives:</p>
          <pre className="command">
            {`LATENTFORGE_WORKER_TOKEN=${token} just worker --backend-url ${window.location.origin}`}
          </pre>
          <div className="form-actions">
            <Button type="button" variant="primary" onClick={onDone}>
              Go to dashboard
            </Button>
          </div>
        </section>
      </Card>
    )
  }

  const submitLabel = status.adminNeeded
    ? 'Create admin'
    : customToken.trim()
      ? 'Use this token'
      : 'Generate token'

  return (
    <Card>
      <section aria-labelledby="setup-heading">
        <h2 id="setup-heading">Welcome to LatentForge</h2>
        <p>
          {status.adminNeeded
            ? 'Create the admin account for this server.'
            : 'One thing to set up: workers authenticate to this server with a shared token.'}
          {status.adminNeeded && status.workerTokenNeeded
            ? ' Workers authenticate with a shared token — generate one (recommended) or paste your own; it is stored on the server.'
            : ''}
        </p>
        <form onSubmit={handleSubmit}>
          {status.adminNeeded && (
            <>
              <Field label="Admin username" htmlFor="setup-username">
                <Input
                  id="setup-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </Field>
              <Field label="Admin password (at least 8 characters)" htmlFor="setup-password">
                <Input
                  id="setup-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </Field>
            </>
          )}
          {status.workerTokenNeeded && (
            <Field label="Worker token (leave blank to generate)" htmlFor="setup-token">
              <Input
                id="setup-token"
                value={customToken}
                onChange={(e) => setCustomToken(e.target.value)}
                placeholder="generated for you"
                autoComplete="off"
              />
            </Field>
          )}
          {error && (
            <Alert variant="danger" className="panel">
              {error}
            </Alert>
          )}
          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </section>
    </Card>
  )
}
