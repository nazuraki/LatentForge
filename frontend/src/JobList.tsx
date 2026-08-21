import { Badge, Button, type BadgeProps } from '@nazuraki/ui-react'
import { cancelJob, type Job } from './api'

interface JobListProps {
  jobs: Job[]
  onChanged: () => void
}

const CANCELABLE: Job['status'][] = ['queued', 'running']

const STATUS_VARIANT: Partial<Record<Job['status'], BadgeProps['variant']>> = {
  running: 'primary',
  succeeded: 'success',
  failed: 'danger',
}

export function JobList({ jobs, onChanged }: JobListProps) {
  async function handleCancel(id: string) {
    try {
      await cancelJob(id)
    } finally {
      onChanged()
    }
  }

  if (jobs.length === 0) {
    return <p className="muted">No jobs yet — submit a prompt above.</p>
  }

  return (
    <div className="table-wrap">
      <table className="nb-table">
        <thead>
          <tr>
            <th>Result</th>
            <th>Prompt</th>
            <th>Model</th>
            <th>Seed</th>
            <th>Status</th>
            <th>Created</th>
            <th aria-label="actions" />
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>
                {job.output?.images.map((src) => (
                  <a key={src} href={src} target="_blank" rel="noreferrer">
                    <img
                      className="thumb"
                      src={src}
                      alt={`Result for: ${job.request.prompt}`}
                    />
                  </a>
                ))}
              </td>
              <td className="prompt-cell" title={job.request.prompt}>
                {job.request.prompt}
              </td>
              <td>{job.request.model ?? '—'}</td>
              <td>{job.output?.seed ?? job.request.seed ?? '—'}</td>
              <td>
                <Badge variant={STATUS_VARIANT[job.status]} title={job.error}>
                  {job.status}
                </Badge>
              </td>
              <td>{new Date(job.createdAt).toLocaleTimeString()}</td>
              <td>
                {CANCELABLE.includes(job.status) && (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => handleCancel(job.id)}
                    aria-label={`Cancel job ${job.request.prompt}`}
                  >
                    Cancel
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
