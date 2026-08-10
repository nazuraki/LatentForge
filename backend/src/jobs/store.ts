import { randomUUID } from 'node:crypto'

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

export interface JobRequest {
  prompt: string
  model?: string
  seed?: number
  params?: Record<string, unknown>
}

export interface Job {
  id: string
  status: JobStatus
  request: JobRequest
  error?: string
  createdAt: string
  updatedAt: string
}

const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  queued: ['running', 'canceled'],
  running: ['succeeded', 'failed', 'canceled'],
  succeeded: [],
  failed: [],
  canceled: [],
}

export class JobStore {
  private jobs = new Map<string, Job>()

  create(request: JobRequest): Job {
    const now = new Date().toISOString()
    const job: Job = {
      id: randomUUID(),
      status: 'queued',
      request,
      createdAt: now,
      updatedAt: now,
    }
    this.jobs.set(job.id, job)
    return job
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id)
  }

  list(status?: JobStatus): Job[] {
    const all = [...this.jobs.values()]
    const filtered = status ? all.filter((j) => j.status === status) : all
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  transition(id: string, to: JobStatus, error?: string): Job {
    const job = this.jobs.get(id)
    if (!job) throw new JobNotFoundError(id)
    if (!TRANSITIONS[job.status].includes(to)) {
      throw new InvalidTransitionError(job.status, to)
    }
    job.status = to
    if (error !== undefined) job.error = error
    job.updatedAt = new Date().toISOString()
    return job
  }
}

export class JobNotFoundError extends Error {
  constructor(id: string) {
    super(`job not found: ${id}`)
  }
}

export class InvalidTransitionError extends Error {
  constructor(from: JobStatus, to: JobStatus) {
    super(`cannot transition job from ${from} to ${to}`)
  }
}
