export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

export interface JobRequest {
  prompt: string
  model?: string
  seed?: number
  params?: Record<string, unknown>
}

export interface JobOutput {
  images: string[]
  seed?: number
}

export interface Job {
  id: string
  status: JobStatus
  request: JobRequest
  workerId?: string
  output?: JobOutput
  error?: string
  createdAt: string
  updatedAt: string
}

export interface Worker {
  id: string
  name: string
  models: string[]
  online: boolean
  registeredAt: string
  lastSeenAt: string
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => undefined)
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `request failed: ${res.status}`
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<T>
}

export function listJobs(): Promise<{ jobs: Job[] }> {
  return request('/api/jobs')
}

export function createJob(job: JobRequest): Promise<Job> {
  return request('/api/jobs', { method: 'POST', body: JSON.stringify(job) })
}

export function cancelJob(id: string): Promise<Job> {
  return request(`/api/jobs/${id}/cancel`, { method: 'POST' })
}

export function listWorkers(): Promise<{ workers: Worker[] }> {
  return request('/api/workers')
}

export function getSetupStatus(): Promise<{ needed: boolean }> {
  return request('/api/setup')
}

export function completeSetup(workerToken?: string): Promise<{ workerToken: string }> {
  return request('/api/setup', {
    method: 'POST',
    body: JSON.stringify(workerToken ? { workerToken } : {}),
  })
}
