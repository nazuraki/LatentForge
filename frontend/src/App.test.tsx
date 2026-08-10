import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { Job, Worker } from './api'

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

let jobs: Job[]
let workers: Worker[]
let setupNeeded: boolean

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  jobs = []
  workers = []
  setupNeeded = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url === '/api/setup' && method === 'GET') return jsonResponse({ needed: setupNeeded })
      if (url === '/api/setup' && method === 'POST') {
        setupNeeded = false
        return jsonResponse({ workerToken: 'generated-token-value' }, 201)
      }
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
  it('renders the LatentForge heading', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'LatentForge' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/no jobs yet/i)).toBeInTheDocument())
  })

  it('walks through first-run setup, shows the token once, then the dashboard', async () => {
    setupNeeded = true
    const user = userEvent.setup()
    render(<App />)
    expect(await screen.findByRole('heading', { name: /welcome to latentforge/i })).toBeVisible()

    await user.click(screen.getByRole('button', { name: /generate token/i }))
    expect(await screen.findByText('generated-token-value')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /go to dashboard/i }))
    await waitFor(() => expect(screen.getByText(/no jobs yet/i)).toBeInTheDocument())
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
  })

  it('shows an offline banner when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed')
    }))
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/backend unreachable/i)
  })
})
