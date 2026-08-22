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
  userId?: string
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
  // Only declare a JSON body when there is one — Fastify 400s on a JSON
  // content-type with an empty body (bodyless POSTs like logout and cancel).
  const res = await fetch(url, {
    ...(init?.body ? { headers: { 'content-type': 'application/json' } } : {}),
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

export interface SetupStatus {
  needed: boolean
  workerTokenNeeded: boolean
}

export interface SetupRequest {
  workerToken?: string
}

export function getSetupStatus(): Promise<SetupStatus> {
  return request('/api/setup')
}

export function completeSetup(body: SetupRequest): Promise<{ workerToken?: string }> {
  return request('/api/setup', { method: 'POST', body: JSON.stringify(body) })
}

// ── Auth (usr SSO) ───────────────────────────────────────────────────────────

export type Role = 'admin' | 'user'

/** The signed-in caller as the server sees it (derived from usr's identity cookie). */
export interface User {
  id: string
  username: string
  role: Role
  tags: string[]
}

/** Verified usr identity, present even when it grants no latentforge access. */
export interface Identity {
  email: string
  roles: string[]
}

export interface AuthStatus {
  authRequired: boolean
  authenticated: boolean
  user: User | null
  identity: Identity | null
  /** Present when the server is configured for usr SSO. */
  sso: { usrUrl: string; app: string; refreshUrl: string | null } | null
}

/** `return` lets the server build the usr refresh URL that lands back here. */
export function getAuthStatus(): Promise<AuthStatus> {
  const params = new URLSearchParams({ return: window.location.href })
  return request(`/api/auth/me?${params}`)
}

// ── Admin: model tags ────────────────────────────────────────────────────────

export function getModelTags(): Promise<{ models: Record<string, string[]> }> {
  return request('/api/model-tags')
}

export function setModelTags(model: string, tags: string[]): Promise<{ model: string; tags: string[] }> {
  return request(`/api/model-tags/${encodeURIComponent(model)}`, {
    method: 'PUT',
    body: JSON.stringify({ tags }),
  })
}
