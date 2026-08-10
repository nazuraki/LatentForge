import { cancelJob, type Job } from './api'

interface JobListProps {
  jobs: Job[]
  onChanged: () => void
}

const CANCELABLE: Job['status'][] = ['queued', 'running']

export function JobList({ jobs, onChanged }: JobListProps) {
  async function handleCancel(id: string) {
    try {
      await cancelJob(id)
    } finally {
      onChanged()
    }
  }

  if (jobs.length === 0) {
    return <p className="empty">No jobs yet — submit a prompt above.</p>
  }

  return (
    <table className="job-table">
      <thead>
        <tr>
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
            <td className="prompt-cell" title={job.request.prompt}>
              {job.request.prompt}
            </td>
            <td>{job.request.model ?? '—'}</td>
            <td>{job.request.seed ?? '—'}</td>
            <td>
              <span className={`status status-${job.status}`} title={job.error}>
                {job.status}
              </span>
            </td>
            <td>{new Date(job.createdAt).toLocaleTimeString()}</td>
            <td>
              {CANCELABLE.includes(job.status) && (
                <button
                  type="button"
                  className="cancel"
                  onClick={() => handleCancel(job.id)}
                  aria-label={`Cancel job ${job.request.prompt}`}
                >
                  Cancel
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
