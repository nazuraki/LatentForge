import { Alert, Button, Card, Field, Input } from '@nazuraki/ui-react'
import { useState, type FormEvent } from 'react'
import { login, type User } from './api'

interface LoginProps {
  onLoggedIn: (user: User) => void
}

export function Login({ onLoggedIn }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>()

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(undefined)
    try {
      const { user } = await login(username, password)
      onLoggedIn(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <section aria-labelledby="login-heading">
        <h2 id="login-heading">Sign in</h2>
        <form onSubmit={handleSubmit}>
          <Field label="Username" htmlFor="login-username">
            <Input
              id="login-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Password" htmlFor="login-password">
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          {error && (
            <Alert variant="danger" className="panel">
              {error}
            </Alert>
          )}
          <div className="form-actions">
            <Button type="submit" variant="primary" disabled={submitting || !username || !password}>
              Sign in
            </Button>
          </div>
        </form>
      </section>
    </Card>
  )
}
