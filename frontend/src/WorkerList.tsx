import type { Worker } from './api'

export function WorkerList({ workers }: { workers: Worker[] }) {
  if (workers.length === 0) {
    return <p className="empty">No workers registered.</p>
  }

  return (
    <ul className="worker-list">
      {workers.map((worker) => (
        <li key={worker.id}>
          <span
            className={`dot ${worker.online ? 'dot-online' : 'dot-offline'}`}
            title={worker.online ? 'online' : 'offline'}
          />
          <span className="worker-name">{worker.name}</span>
          {worker.models.length > 0 && (
            <span className="worker-models">{worker.models.join(', ')}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
