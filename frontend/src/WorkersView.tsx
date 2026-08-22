import { Badge, Card } from '@nazuraki/ui-react'
import type { Worker } from './api'

interface WorkersViewProps {
  workers: Worker[]
  /** Selected worker id (detail view), if any. */
  workerId?: string
  onSelect: (workerId?: string) => void
}

function StatusBadge({ online }: { online: boolean }) {
  return <Badge variant={online ? 'success' : undefined}>{online ? 'online' : 'offline'}</Badge>
}

function WorkerDetail({ worker, onBack }: { worker: Worker; onBack: () => void }) {
  return (
    <Card className="panel">
      <section aria-labelledby="worker-heading">
        <p>
          <a
            href="#/workers"
            onClick={(e) => {
              e.preventDefault()
              onBack()
            }}
          >
            ← All workers
          </a>
        </p>
        <h2 id="worker-heading">{worker.name}</h2>
        <dl className="details">
          <dt>Status</dt>
          <dd>
            <StatusBadge online={worker.online} />
          </dd>
          <dt>Registered</dt>
          <dd>{new Date(worker.registeredAt).toLocaleString()}</dd>
          <dt>Last seen</dt>
          <dd>{new Date(worker.lastSeenAt).toLocaleString()}</dd>
          <dt>Models</dt>
          <dd>
            {worker.models.length === 0 ? (
              <span className="muted">None reported.</span>
            ) : (
              <ul className="model-list">
                {worker.models.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </dd>
        </dl>
      </section>
    </Card>
  )
}

/** Workers: a name + status list; selecting one shows its details and models. */
export function WorkersView({ workers, workerId, onSelect }: WorkersViewProps) {
  const selected = workerId ? workers.find((w) => w.id === workerId) : undefined

  if (selected) return <WorkerDetail worker={selected} onBack={() => onSelect(undefined)} />

  return (
    <Card className="panel">
      <section aria-labelledby="workers-heading">
        <h2 id="workers-heading">Workers</h2>
        {workerId && <p className="muted">Worker not found: {workerId}</p>}
        {workers.length === 0 ? (
          <p className="muted">No workers registered.</p>
        ) : (
          <ul className="worker-list">
            {workers.map((worker) => (
              <li key={worker.id}>
                <StatusBadge online={worker.online} />
                <a
                  href={`#/workers/${encodeURIComponent(worker.id)}`}
                  onClick={(e) => {
                    e.preventDefault()
                    onSelect(worker.id)
                  }}
                >
                  {worker.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  )
}
