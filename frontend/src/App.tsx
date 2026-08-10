import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { getSetupStatus, listJobs, listWorkers, type Job, type Worker } from './api'
import { JobForm } from './JobForm'
import { JobList } from './JobList'
import { Setup } from './Setup'
import { WorkerList } from './WorkerList'

const POLL_INTERVAL_MS = 3000

function App() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [offline, setOffline] = useState(false)
  // undefined = status unknown (don't flash either screen before the first response)
  const [setupNeeded, setSetupNeeded] = useState<boolean | undefined>()

  useEffect(() => {
    getSetupStatus().then(
      ({ needed }) => setSetupNeeded(needed),
      // Unreachable backend: show the dashboard, which has the offline banner.
      () => setSetupNeeded(false),
    )
  }, [])

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
    if (setupNeeded !== false) return
    refresh()
    const timer = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [refresh, setupNeeded])

  if (setupNeeded === undefined) return null
  if (setupNeeded) {
    return (
      <main>
        <h1>LatentForge</h1>
        <Setup onDone={() => setSetupNeeded(false)} />
      </main>
    )
  }

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
