import { Alert, Card } from '@nazuraki/ui-react'
import { useCallback, useEffect, useState } from 'react'
import { CreateUserForm } from './admin/CreateUserForm'
import { ModelTagTable } from './admin/ModelTagTable'
import { UserTable, type UserUpdate } from './admin/UserTable'
import { listUsers, updateUser, type User } from './api'

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

  async function apply(id: string, update: UserUpdate) {
    try {
      await updateUser(id, update)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'update failed')
    }
  }

  return (
    <Card className="panel">
      <section aria-labelledby="admin-heading">
        <h2 id="admin-heading">Admin</h2>
        {error && (
          <Alert variant="danger" className="panel">
            {error}
          </Alert>
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
    </Card>
  )
}
