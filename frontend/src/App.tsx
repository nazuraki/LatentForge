import { Alert, Card } from '@nazuraki/ui-react'
import { useCallback, useEffect, useState } from 'react'
import { Admin } from './Admin'
import {
  ApiError,
  getAuthStatus,
  getSetupStatus,
  listJobs,
  listWorkers,
  type AuthStatus,
  type Job,
  type SetupStatus,
  type Worker,
} from './api'
import { JobForm } from './JobForm'
import { JobList } from './JobList'
import { BOUNCE_KEY, Login } from './Login'
import { Setup } from './Setup'
import { TopNav } from './TopNav'
import { useRoute } from './useRoute'
import { WorkersView } from './WorkersView'

const POLL_INTERVAL_MS = 3000

// Unreachable backend: show the dashboard, which has the offline banner.
const OFFLINE_SETUP: SetupStatus = { needed: false, workerTokenNeeded: false }
const OFFLINE_AUTH: AuthStatus = {
  authRequired: false,
  authenticated: true,
  user: null,
  identity: null,
  sso: null,
}

function App() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [offline, setOffline] = useState(false)
  const [route, navigate] = useRoute()
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
      // An expired `nz_id` (401) or revoked role (403) mid-session: re-check
      // auth so the SPA bounces to usr (or explains) instead of showing errors.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setAuth(await getAuthStatus().catch(() => OFFLINE_AUTH))
        return
      }
      setOffline(true)
    }
  }, [])

  const ready = setup !== undefined && !setup.needed && auth !== undefined && auth.authenticated

  useEffect(() => {
    if (!ready) return
    // A successful round trip through usr clears the bounce guard.
    sessionStorage.removeItem(BOUNCE_KEY)
    refresh()
    const timer = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [refresh, ready])

  if (setup === undefined || auth === undefined) return null

  if (setup.needed) {
    return (
      <main className="narrow">
        <h1 className="brand">LatentForge</h1>
        <Setup onDone={loadStatus} />
      </main>
    )
  }

  if (auth.authRequired && !auth.authenticated) {
    return (
      <main className="narrow">
        <h1 className="brand">LatentForge</h1>
        <Login status={auth} />
      </main>
    )
  }

  const isAdmin = !auth.authRequired || auth.user?.role === 'admin'
  const models = [...new Set(workers.flatMap((w) => w.models))]

  return (
    <>
      <TopNav
        route={route}
        onNavigate={navigate}
        user={auth.user}
        isAdmin={isAdmin}
        accountUrl={auth.sso?.usrUrl}
      />
      <main>
        {offline && (
          <Alert variant="warning" className="panel">
            Backend unreachable — is the API server running? (<code>just dev-backend</code>)
          </Alert>
        )}
        {route.view === 'admin' && isAdmin && <Admin models={models} usrUrl={auth.sso?.usrUrl} />}
        {route.view === 'workers' && (
          <WorkersView
            workers={workers}
            workerId={route.workerId}
            onSelect={(workerId) => navigate({ view: 'workers', workerId })}
          />
        )}
        {(route.view === 'jobs' || (route.view === 'admin' && !isAdmin)) && (
          <Card className="panel">
            <section aria-labelledby="jobs-heading">
              <h2 id="jobs-heading">Jobs</h2>
              <JobForm onCreated={refresh} />
              <JobList jobs={jobs} onChanged={refresh} />
            </section>
          </Card>
        )}
      </main>
    </>
  )
}

export default App
