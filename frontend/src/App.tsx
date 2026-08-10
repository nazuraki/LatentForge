import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { listJobs, listWorkers, type Job, type Worker } from './api'
import { JobForm } from './JobForm'
import { JobList } from './JobList'
import { WorkerList } from './WorkerList'

const POLL_INTERVAL_MS = 3000

function App() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [offline, setOffline] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [jobsRes, workersRes] = await Promise.all([listJobs(), listWorkers()])
      setJobs(jobsRes.jobs)
      setWorkers(workersRes.workers)
      setOffline(false)
    } catch {
      setOffline(true)
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  return (
    <main>
      <h1>LatentForge</h1>
      <p>Distributed image generation with workflow automation and managed assets.</p>
      {offline && (
        <p className="offline-banner" role="alert">
          Backend unreachable — is the API server running? (<code>just dev-backend</code>)
        </p>
      )}
      <section aria-labelledby="jobs-heading">
        <h2 id="jobs-heading">Jobs</h2>
        <JobForm onCreated={refresh} />
        <JobList jobs={jobs} onChanged={refresh} />
      </section>
      <section aria-labelledby="workers-heading">
        <h2 id="workers-heading">Workers</h2>
        <WorkerList workers={workers} />
      </section>
    </main>
  )
}

export default App
