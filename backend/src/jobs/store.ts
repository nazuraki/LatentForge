import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

export interface JobRequest {
  prompt: string
  model?: string
  seed?: number
  params?: Record<string, unknown>
}

export interface JobOutput {
  /** Asset URLs, e.g. /api/assets/<file>. */
  images: string[]
  /** The seed actually used, for reproducibility when the request left it random. */
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

const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  queued: ['running', 'canceled'],
  running: ['succeeded', 'failed', 'canceled'],
  succeeded: [],
  failed: [],
  canceled: [],
}

// The implicit rowid provides strict creation order; created_at alone cannot
// (same-millisecond jobs share a timestamp).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id         TEXT PRIMARY KEY,
  status     TEXT NOT NULL,
  request    TEXT NOT NULL,
  worker_id  TEXT,
  output     TEXT,
  error      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
`

interface JobRow {
  id: string
  status: JobStatus
  request: string
  worker_id: string | null
  output: string | null
  error: string | null
  created_at: string
  updated_at: string
}

export class JobStore {
  private db: Database.Database

  constructor(dbPath = ':memory:') {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(SCHEMA)
  }

  create(request: JobRequest): Job {
    const now = new Date().toISOString()
    const job: Job = {
      id: randomUUID(),
      status: 'queued',
      request,
      createdAt: now,
      updatedAt: now,
    }
    this.db
      .prepare(
        `INSERT INTO jobs (id, status, request, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(job.id, job.status, JSON.stringify(request), now, now)
    return job
  }

  get(id: string): Job | undefined {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined
    return row && rowToJob(row)
  }

  /** Newest first (strict creation order via rowid), optionally filtered by status. */
  list(status?: JobStatus): Job[] {
    const rows = (
      status
        ? this.db.prepare('SELECT * FROM jobs WHERE status = ? ORDER BY rowid DESC').all(status)
        : this.db.prepare('SELECT * FROM jobs ORDER BY rowid DESC').all()
    ) as JobRow[]
    return rows.map(rowToJob)
  }

  /** Claim the oldest queued job for a worker, moving it to running. */
  claimNext(workerId: string): Job | undefined {
    const row = this.db
      .prepare(`SELECT id FROM jobs WHERE status = 'queued' ORDER BY rowid LIMIT 1`)
      .get() as Pick<JobRow, 'id'> | undefined
    if (!row) return undefined
    this.db.prepare('UPDATE jobs SET worker_id = ? WHERE id = ?').run(workerId, row.id)
    return this.transition(row.id, 'running')
  }

  transition(id: string, to: JobStatus, extra: { error?: string; output?: JobOutput } = {}): Job {
    const job = this.get(id)
    if (!job) throw new JobNotFoundError(id)
    if (!TRANSITIONS[job.status].includes(to)) {
      throw new InvalidTransitionError(job.status, to)
    }
    const now = new Date().toISOString()
    this.db
      .prepare(
        `UPDATE jobs SET status = ?, error = COALESCE(?, error),
         output = COALESCE(?, output), updated_at = ? WHERE id = ?`,
      )
      .run(to, extra.error ?? null, extra.output ? JSON.stringify(extra.output) : null, now, id)
    return this.get(id) as Job
  }

  /** Re-queue jobs left running by a previous process; their claims died with it. */
  recoverInterrupted(): number {
    return this.db
      .prepare(
        `UPDATE jobs SET status = 'queued', worker_id = NULL, updated_at = ?
         WHERE status = 'running'`,
      )
      .run(new Date().toISOString()).changes
  }

  close(): void {
    this.db.close()
  }
}

function rowToJob(row: JobRow): Job {
  const job: Job = {
    id: row.id,
    status: row.status,
    request: JSON.parse(row.request),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
  if (row.worker_id !== null) job.workerId = row.worker_id
  if (row.output !== null) job.output = JSON.parse(row.output)
  if (row.error !== null) job.error = row.error
  return job
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
