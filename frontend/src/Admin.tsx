import { Alert, Card } from '@nazuraki/ui-react'
import { useState } from 'react'
import { ModelTagTable } from './admin/ModelTagTable'

interface AdminProps {
  /** Models known to the connected workers, for the tag editor. */
  models: string[]
  /** Where accounts and roles are managed (usr); shown as a pointer. */
  usrUrl?: string
}

/**
 * Admin panel: model-access tags only. Users and their grants live in usr —
 * a user's tags are their `latentforge:*` roles there.
 */
export function Admin({ models, usrUrl }: AdminProps) {
  const [error, setError] = useState<string | undefined>()

  return (
    <Card className="panel">
      <section aria-labelledby="admin-heading">
        <h2 id="admin-heading">Admin</h2>
        {error && (
          <Alert variant="danger" className="panel">
            {error}
          </Alert>
        )}
        <h3>Model access tags</h3>
        <p>
          Tag a model to restrict it; a user needs every tag on a model to run it. Tags are{' '}
          <code>latentforge:&lt;tag&gt;</code> roles granted in{' '}
          {usrUrl ? <a href={usrUrl}>usr</a> : 'usr'} (<code>latentforge:admin</code> bypasses tags).
          Untagged models are open to every user.
        </p>
        <ModelTagTable models={models} onError={setError} />
      </section>
    </Card>
  )
}
