import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { AuthStatus, Job, SetupStatus, User, Worker } from './api'
import { BOUNCE_KEY } from './Login'

function job(overrides: Partial<Job> & { id: string }): Job {
  return {
    status: 'queued',
    request: { prompt: `prompt for ${overrides.id}` },
    createdAt: '2026-08-10T12:00:00.000Z',
    updatedAt: '2026-08-10T12:00:00.000Z',
    ...overrides,
  }
}

const worker: Worker = {
  id: 'w1',
  name: 'gpu-1',
  models: ['sdxl-1.0'],
  online: true,
  registeredAt: '2026-08-10T11:00:00.000Z',
  lastSeenAt: '2026-08-10T12:00:00.000Z',
}

const adminUser: User = { id: 'admin@example.com', username: 'admin@example.com', role: 'admin', tags: [] }

const USR_URL = 'https://usr.example.internal'
const SSO: NonNullable<AuthStatus['sso']> = {
  usrUrl: USR_URL,
  app: 'latentforge',
  refreshUrl: `${USR_URL}/api/auth/sso/refresh?return=x`,
}

let jobs: Job[]
let workers: Worker[]
let setupStatus: SetupStatus
let authRequired: boolean
/** The usr identity carried by the browser's cookie, if any. */
let identity: AuthStatus['identity']
/** The principal the server derives from it (null = no latentforge role). */
let signedIn: User | null
let modelTags: Record<string, string[]>

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  jobs = []
  workers = []
  setupStatus = { needed: false, workerTokenNeeded: false }
  authRequired = false
  identity = null
  signedIn = null
  modelTags = {}
  sessionStorage.clear()
  window.location.hash = ''
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url === '/api/setup' && method === 'GET') return jsonResponse(setupStatus)
      if (url === '/api/setup' && method === 'POST') {
        setupStatus = { needed: false, workerTokenNeeded: false }
        return jsonResponse({ workerToken: 'generated-token-value' }, 201)
      }
      if (url.startsWith('/api/auth/me')) {
        return jsonResponse({
          authRequired,
          authenticated: !authRequired || signedIn !== null,
          user: signedIn,
          identity,
          sso: authRequired ? SSO : null,
        })
      }
      if (url === '/api/model-tags' && method === 'GET') return jsonResponse({ models: modelTags })
      if (url === '/api/jobs' && method === 'GET') return jsonResponse({ jobs })
      if (url === '/api/jobs' && method === 'POST') {
        const body = JSON.parse(String(init?.body))
        const created = job({ id: `j${jobs.length + 1}`, request: body })
        jobs = [created, ...jobs]
        return jsonResponse(created, 201)
      }
      if (url.endsWith('/cancel') && method === 'POST') {
        const id = url.split('/')[3]
        jobs = jobs.map((j) => (j.id === id ? { ...j, status: 'canceled' } : j))
        return jsonResponse(jobs.find((j) => j.id === id))
      }
      if (url === '/api/workers' && method === 'GET') return jsonResponse({ workers })
      throw new Error(`unexpected request: ${method} ${url}`)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('renders the LatentForge brand in the top nav', async () => {
    render(<App />)
    expect(await screen.findByRole('link', { name: 'LatentForge' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/no jobs yet/i)).toBeInTheDocument())
  })

  it('walks through first-run setup (worker token), shows the token once, then the dashboard', async () => {
    setupStatus = { needed: true, workerTokenNeeded: true }
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole('heading', { name: /welcome to latentforge/i })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /generate token/i }))
    expect(await screen.findByText('generated-token-value')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /go to dashboard/i }))
    await waitFor(() => expect(screen.getByText(/no jobs yet/i)).toBeInTheDocument())
  })

  it('bounces to usr when SSO is required and no identity cookie is present', async () => {
    authRequired = true
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, href: 'https://lf.example.internal/', assign })
    render(<App />)
    await waitFor(() => expect(assign).toHaveBeenCalledWith(SSO.refreshUrl))
    expect(sessionStorage.getItem(BOUNCE_KEY)).toBe('1')
  })

  it('offers a manual sign-in instead of looping after a fruitless bounce', async () => {
    authRequired = true
    sessionStorage.setItem(BOUNCE_KEY, '1')
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, href: 'https://lf.example.internal/', assign })
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(/without an identity cookie/i)
    expect(assign).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /sign in with usr/i }))
    expect(assign).toHaveBeenCalledWith(SSO.refreshUrl)
  })

  it('explains when the usr identity has no latentforge role', async () => {
    authRequired = true
    identity = { email: 'nobody@example.com', roles: [] }
    render(<App />)
    expect(await screen.findByText('nobody@example.com')).toBeInTheDocument()
    expect(screen.getByText(/role in usr/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })

  it('shows the signed-in user and an Account link to usr in the profile menu', async () => {
    authRequired = true
    identity = { email: adminUser.id, roles: ['admin'] }
    signedIn = adminUser
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /profile menu/i }))
    expect(screen.getByText(/signed in as/i)).toHaveTextContent('admin@example.com')
    expect(screen.getByRole('menuitem', { name: 'Account' })).toHaveAttribute('href', USR_URL)
    await waitFor(() => expect(screen.getByText(/no jobs yet/i)).toBeInTheDocument())
  })

  it('hides the Admin entry from non-admin users', async () => {
    authRequired = true
    identity = { email: 'u@example.com', roles: ['user'] }
    signedIn = { id: 'u@example.com', username: 'u@example.com', role: 'user', tags: [] }
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /profile menu/i }))
    expect(screen.getByRole('menuitem', { name: 'Account' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('navigates to the admin view from the profile menu and back via the brand', async () => {
    authRequired = true
    identity = { email: adminUser.id, roles: ['admin'] }
    signedIn = adminUser
    workers = [worker]
    modelTags = { 'sdxl-1.0': ['nsfw'] }
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /profile menu/i }))
    await user.click(screen.getByRole('menuitem', { name: 'Admin' }))
    expect(await screen.findByLabelText('Tags for model sdxl-1.0')).toHaveValue('nsfw')
    expect(window.location.hash).toBe('#/admin')
    expect(screen.queryByRole('heading', { name: 'Jobs' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'LatentForge' }))
    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument()
  })

  it('lists jobs and workers from the API', async () => {
    jobs = [job({ id: 'j1', status: 'running', workerId: 'w1' })]
    workers = [worker]
    render(<App />)
    expect(await screen.findByText('prompt for j1')).toBeInTheDocument()
    expect(screen.getByText('running')).toBeInTheDocument()
    expect(screen.getByText('gpu-1')).toBeInTheDocument()
    expect(screen.getByText('sdxl-1.0')).toBeInTheDocument()
  })

  it('shows result thumbnails and the actual seed on succeeded jobs', async () => {
    jobs = [
      job({
        id: 'j1',
        status: 'succeeded',
        output: { images: ['/api/assets/j1-0.png'], seed: 1234 },
      }),
    ]
    render(<App />)
    const thumb = await screen.findByRole('img', { name: /result for: prompt for j1/i })
    expect(thumb).toHaveAttribute('src', '/api/assets/j1-0.png')
    expect(thumb.closest('a')).toHaveAttribute('href', '/api/assets/j1-0.png')
    expect(screen.getByText('1234')).toBeInTheDocument()
  })

  it('submits a new job and shows it in the list', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText('Prompt'), 'a red fox')
    await user.type(screen.getByLabelText('Model'), 'sdxl-1.0')
    await user.type(screen.getByLabelText('Seed'), '42')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    expect(await screen.findByText('a red fox')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      '/api/jobs',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ prompt: 'a red fox', model: 'sdxl-1.0', seed: 42 }),
      }),
    )
  })

  it('keeps Generate disabled until a prompt is entered', async () => {
    const user = userEvent.setup()
    render(<App />)
    const button = await screen.findByRole('button', { name: 'Generate' })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(fetch).not.toHaveBeenCalledWith('/api/jobs', expect.objectContaining({ method: 'POST' }))
    await user.type(screen.getByLabelText('Prompt'), 'a red fox')
    expect(button).toBeEnabled()
  })

  it('cancels a queued job', async () => {
    jobs = [job({ id: 'j1' })]
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: /cancel job/i }))
    expect(await screen.findByText('canceled')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cancel job/i })).not.toBeInTheDocument()
    // Bodyless POSTs must not claim a JSON body — Fastify rejects that with 400.
    expect(fetch).toHaveBeenCalledWith(
      '/api/jobs/j1/cancel',
      expect.not.objectContaining({ headers: expect.anything() }),
    )
  })

  it('shows an offline banner when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed')
    }))
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/backend unreachable/i)
  })
})
