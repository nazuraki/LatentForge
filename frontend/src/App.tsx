import { useCallback, useEffect, useState } from 'react'
import './App.css'
import { Admin } from './Admin'
import {
  ApiError,
  getAuthStatus,
  getSetupStatus,
  listJobs,
  listWorkers,
  logout,
  type AuthStatus,
  type Job,
  type SetupStatus,
  type User,
  type Worker,
} from './api'
import { JobForm } from './JobForm'
import { JobList } from './JobList'
import { Login } from './Login'
import { Setup } from './Setup'
import { WorkerList } from './WorkerList'

const POLL_INTERVAL_MS = 3000

// Unreachable backend: show the dashboard, which has the offline banner.
const OFFLINE_SETUP: SetupStatus = { needed: false, workerTokenNeeded: false, adminNeeded: false }
const OFFLINE_AUTH: AuthStatus = { authRequired: false, authenticated: true, user: null }

function App() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [offline, setOffline] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  // undefined = status unknown (don't flash any screen before the first response)
  const [setup, setSetup] = useState<SetupStatus | undefined>()
  const [auth, setAuth] = useState<AuthStatus | undefined>()

  const loadStatus = useCallback(async () => {
    setSetup(await getSetupStatus().catch(() => OFFLINE_SETUP))
    setAuth(await getAuthStatus().catch(() => OFFLINE_AUTH))
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const refresh = useCallback(async () => {
    try {
      const [jobsRes, workersRes] = await Promise.all([listJobs(), listWorkers()])
      setJobs(jobsRes.jobs)
      setWorkers(workersRes.workers)
      setOffline(false)
    } catch (err) {
      // An expired or revoked session bounces back to the login screen.
      if (err instanceof ApiError && err.status === 401) {
        setAuth((a) => a && { ...a, authenticated: false, user: null })
        return
      }
      setOffline(true)
    }
  }, [])

  const ready = setup !== undefined && !setup.needed && auth !== undefined && auth.authenticated

  useEffect(() => {
    if (!ready) return
    refresh()
    const timer = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [refresh, ready])

  async function handleLogout() {
    await logout().catch(() => undefined)
    setShowAdmin(false)
    setAuth((a) => a && { ...a, authenticated: false, user: null })
  }

  function handleLoggedIn(user: User) {
    setAuth((a) => a && { ...a, authenticated: true, user })
  }

  if (setup === undefined || auth === undefined) return null

  if (setup.needed) {
    return (
      <main>
        <h1>LatentForge</h1>
        <Setup status={setup} onDone={loadStatus} />
      </main>
    )
  }

  if (auth.authRequired && !auth.authenticated) {
    return (
      <main>
        <h1>LatentForge</h1>
        <Login onLoggedIn={handleLoggedIn} />
      </main>
    )
  }

  const isAdmin = !auth.authRequired || auth.user?.role === 'admin'
  const models = [...new Set(workers.flatMap((w) => w.models))]

  return (
    <main>
      <h1>LatentForge</h1>
      <p>Distributed image generation with workflow automation and managed assets.</p>
      {(auth.authRequired || isAdmin) && (
        <p className="topbar">
          {auth.user && <span>Signed in as {auth.user.username}</span>}
          {isAdmin && (
            <button type="button" className="cancel" onClick={() => setShowAdmin(!showAdmin)}>
              {showAdmin ? 'Hide admin' : 'Admin'}
            </button>
          )}
          {auth.authRequired && (
            <button type="button" className="cancel" onClick={handleLogout}>
              Sign out
            </button>
          )}
        </p>
      )}
      {offline && (
        <p className="offline-banner" role="alert">
          Backend unreachable — is the API server running? (<code>just dev-backend</code>)
        </p>
      )}
      {showAdmin && isAdmin && <Admin models={models} selfId={auth.user?.id} />}
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
