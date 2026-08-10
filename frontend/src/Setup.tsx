import { useState, type FormEvent } from 'react'
import { completeSetup } from './api'

interface SetupProps {
  onDone: () => void
}

/**
 * First-run setup: creates the worker token (generated unless the user pastes
 * their own) and shows it exactly once — the server never returns it again.
 */
export function Setup({ onDone }: SetupProps) {
  const [customToken, setCustomToken] = useState('')
  const [token, setToken] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | undefined>()

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(undefined)
    try {
      const res = await completeSetup(customToken.trim() || undefined)
      setToken(res.workerToken)
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

  if (token) {
    return (
      <section className="setup" aria-labelledby="setup-heading">
        <h2 id="setup-heading">Setup complete</h2>
        <p>
          This is your worker token. It is shown <strong>only once</strong> — copy it now and use
          it to connect workers:
        </p>
        <p>
          <code className="setup-token">{token}</code>
        </p>
        <button type="button" onClick={copyToken}>
          {copied ? 'Copied' : 'Copy token'}
        </button>
        <p>Then start a worker wherever your GPU lives:</p>
        <pre className="setup-command">
          {`LATENTFORGE_WORKER_TOKEN=${token} just worker --backend-url ${window.location.origin}`}
        </pre>
        <button type="button" onClick={onDone}>
          Go to dashboard
        </button>
      </section>
    )
  }

  return (
    <section className="setup" aria-labelledby="setup-heading">
      <h2 id="setup-heading">Welcome to LatentForge</h2>
      <p>
        One thing to set up: workers authenticate to this server with a shared token. Generate one
        (recommended) or paste your own. It is stored on the server — you never need a config file.
      </p>
      <form className="job-form" onSubmit={handleSubmit}>
        <label>
          Worker token (leave blank to generate)
          <input
            value={customToken}
            onChange={(e) => setCustomToken(e.target.value)}
            placeholder="generated for you"
            autoComplete="off"
          />
        </label>
        <div className="job-form-row">
          <button type="submit" disabled={submitting}>
            {customToken.trim() ? 'Use this token' : 'Generate token'}
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  )
}
