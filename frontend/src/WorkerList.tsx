import { Badge } from '@nazuraki/ui-react'
import type { Worker } from './api'

export function WorkerList({ workers }: { workers: Worker[] }) {
  if (workers.length === 0) {
    return <p className="muted">No workers registered.</p>
  }

  return (
    <ul className="worker-list">
      {workers.map((worker) => (
        <li key={worker.id}>
          <Badge variant={worker.online ? 'success' : undefined}>
            {worker.online ? 'online' : 'offline'}
          </Badge>
          <span>{worker.name}</span>
          {worker.models.length > 0 && (
            <span className="worker-models">{worker.models.join(', ')}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
