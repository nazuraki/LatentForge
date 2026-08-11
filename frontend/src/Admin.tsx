import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  createUser,
  getModelTags,
  listUsers,
  setModelTags,
  updateUser,
  type Role,
  type User,
} from './api'

function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

interface AdminProps {
  /** Models known to the connected workers, for the tag editor. */
  models: string[]
  /** The signed-in admin (never editable here to avoid self-lockout confusion). */
  selfId?: string
}

export function Admin({ models, selfId }: AdminProps) {
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState<string | undefined>()

  const refresh = useCallback(async () => {
    try {
      setUsers((await listUsers()).users)
      setError(undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to load users')
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function apply(id: string, update: Parameters<typeof updateUser>[1]) {
    try {
      await updateUser(id, update)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'update failed')
    }
  }

  return (
    <section aria-labelledby="admin-heading">
      <h2 id="admin-heading">Admin</h2>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <h3>Users</h3>
      <UserTable users={users} selfId={selfId} onApply={apply} />
      <CreateUserForm onCreated={refresh} onError={setError} />
      <h3>Model access tags</h3>
      <p>
        Tag a model to restrict it; users need every tag on a model granted to run it. Untagged
        models are open to everyone.
      </p>
      <ModelTagTable models={models} onError={setError} />
    </section>
  )
}

function UserTable({
  users,
  selfId,
  onApply,
}: {
  users: User[]
  selfId?: string
  onApply: (id: string, update: { role?: Role; disabled?: boolean; tags?: string[] }) => void
}) {
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({})

  if (users.length === 0) return <p className="empty">No users yet.</p>
  return (
    <table className="job-table">
      <thead>
        <tr>
          <th>Username</th>
          <th>Role</th>
          <th>Tag grants</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => {
          const self = user.id === selfId
          const draft = tagDrafts[user.id] ?? user.tags.join(', ')
          return (
            <tr key={user.id}>
              <td>{user.username}{self ? ' (you)' : ''}</td>
              <td>
                <select
                  aria-label={`Role for ${user.username}`}
                  value={user.role}
                  disabled={self}
                  onChange={(e) => onApply(user.id, { role: e.target.value as Role })}
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </td>
              <td>
                <input
                  aria-label={`Tags for ${user.username}`}
                  value={draft}
                  placeholder="e.g. nsfw"
                  onChange={(e) => setTagDrafts({ ...tagDrafts, [user.id]: e.target.value })}
                  onBlur={() => {
                    if (draft !== user.tags.join(', ')) onApply(user.id, { tags: parseTags(draft) })
                  }}
                />
              </td>
              <td>
                {self ? (
                  'active'
                ) : (
                  <button
                    type="button"
                    className="cancel"
                    onClick={() => onApply(user.id, { disabled: !user.disabled })}
                  >
                    {user.disabled ? 'Enable' : 'Disable'}
                  </button>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function CreateUserForm({
  onCreated,
  onError,
}: {
  onCreated: () => void
  onError: (message: string) => void
}) {
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
    <form className="job-form" onSubmit={handleSubmit}>
      <div className="job-form-row">
        <label>
          New username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        <label>
          Role
          <select aria-label="New user role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <label>
          Tag grants
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. nsfw" />
        </label>
        <button type="submit" disabled={submitting || !username.trim() || password.length < 8}>
          Add user
        </button>
      </div>
    </form>
  )
}

function ModelTagTable({ models, onError }: { models: string[]; onError: (m: string) => void }) {
  const [tags, setTags] = useState<Record<string, string[]>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    getModelTags().then(
      ({ models: assigned }) => setTags(assigned),
      (err) => onError(err instanceof Error ? err.message : 'failed to load model tags'),
    )
  }, [onError])

  // Every model a worker offers, plus any model that already has tags.
  const all = [...new Set([...models, ...Object.keys(tags)])].sort()

  async function save(model: string, draft: string) {
    try {
      const res = await setModelTags(model, parseTags(draft))
      setTags((prev) => ({ ...prev, [model]: res.tags }))
    } catch (err) {
      onError(err instanceof Error ? err.message : 'failed to save model tags')
    }
  }

  if (all.length === 0) return <p className="empty">No models yet — connect a worker.</p>
  return (
    <table className="job-table">
      <thead>
        <tr>
          <th>Model</th>
          <th>Tags</th>
        </tr>
      </thead>
      <tbody>
        {all.map((model) => {
          const current = (tags[model] ?? []).join(', ')
          const draft = drafts[model] ?? current
          return (
            <tr key={model}>
              <td>{model}</td>
              <td>
                <input
                  aria-label={`Tags for model ${model}`}
                  value={draft}
                  placeholder="open to everyone"
                  onChange={(e) => setDrafts({ ...drafts, [model]: e.target.value })}
                  onBlur={() => {
                    if (draft !== current) save(model, draft)
                  }}
                />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
