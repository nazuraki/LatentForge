import { Button, Field, Input, Select } from '@nazuraki/ui-react'
import { useState, type FormEvent } from 'react'
import { createUser, type Role } from '../api'
import { parseTags } from './tags'

interface CreateUserFormProps {
  onCreated: () => void
  onError: (message: string) => void
}

export function CreateUserForm({ onCreated, onError }: CreateUserFormProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('user')
  const [tags, setTags] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await createUser(username.trim(), password, role, parseTags(tags))
      setUsername('')
      setPassword('')
      setTags('')
      onCreated()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'failed to create user')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-row">
        <Field label="New username" htmlFor="new-username">
          <Input
            id="new-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </Field>
        <Field label="Password" htmlFor="new-password">
          <Input
            id="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </Field>
        <Field label="Role" htmlFor="new-role">
          <Select
            id="new-role"
            aria-label="New user role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </Select>
        </Field>
        <Field label="Tag grants" htmlFor="new-tags">
          <Input
            id="new-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g. nsfw"
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          disabled={submitting || !username.trim() || password.length < 8}
        >
          Add user
        </Button>
      </div>
    </form>
  )
}
