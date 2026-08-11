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

export interface SetupStatus {
  needed: boolean
  workerTokenNeeded: boolean
  adminNeeded: boolean
}

export interface SetupRequest {
  workerToken?: string
  username?: string
  password?: string
}

export function getSetupStatus(): Promise<SetupStatus> {
  return request('/api/setup')
}

export function completeSetup(body: SetupRequest): Promise<{ workerToken?: string }> {
  return request('/api/setup', { method: 'POST', body: JSON.stringify(body) })
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export type Role = 'admin' | 'user'

export interface User {
  id: string
  username: string
  role: Role
  disabled: boolean
  tags: string[]
  createdAt: string
}

export interface AuthStatus {
  authRequired: boolean
  authenticated: boolean
  user: User | null
}

export function getAuthStatus(): Promise<AuthStatus> {
  return request('/api/auth/me')
}

export function login(username: string, password: string): Promise<{ user: User }> {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
}

export function logout(): Promise<{ ok: boolean }> {
  return request('/api/auth/logout', { method: 'POST' })
}

// ── Admin: users and model tags ──────────────────────────────────────────────

export interface UserUpdate {
  password?: string
  role?: Role
  disabled?: boolean
  tags?: string[]
}

export function listUsers(): Promise<{ users: User[] }> {
  return request('/api/users')
}

export function createUser(
  username: string,
  password: string,
  role: Role,
  tags: string[],
): Promise<User> {
  return request('/api/users', {
    method: 'POST',
    body: JSON.stringify({ username, password, role, ...(tags.length ? { tags } : {}) }),
  })
}

export function updateUser(id: string, update: UserUpdate): Promise<User> {
  return request(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(update) })
}

export function getModelTags(): Promise<{ models: Record<string, string[]> }> {
  return request('/api/model-tags')
}

export function setModelTags(model: string, tags: string[]): Promise<{ model: string; tags: string[] }> {
  return request(`/api/model-tags/${encodeURIComponent(model)}`, {
    method: 'PUT',
    body: JSON.stringify({ tags }),
  })
}
