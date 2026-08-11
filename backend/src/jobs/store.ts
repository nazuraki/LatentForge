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
  /** Owner; absent on jobs created before auth existed (visible to admins only). */
  userId?: string
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
  user_id    TEXT,
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
  user_id: string | null
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
    // Databases created before per-user jobs lack the column.
    const cols = this.db.pragma('table_info(jobs)') as { name: string }[]
    if (!cols.some((c) => c.name === 'user_id')) {
      this.db.exec('ALTER TABLE jobs ADD COLUMN user_id TEXT')
    }
  }

  create(request: JobRequest, userId?: string): Job {
    const now = new Date().toISOString()
    const job: Job = {
      id: randomUUID(),
      status: 'queued',
      request,
      createdAt: now,
      updatedAt: now,
    }
    if (userId !== undefined) job.userId = userId
    this.db
      .prepare(
        `INSERT INTO jobs (id, status, request, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(job.id, job.status, JSON.stringify(request), userId ?? null, now, now)
    return job
  }

  get(id: string): Job | undefined {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined
    return row && rowToJob(row)
  }

  /** Newest first (strict creation order via rowid), optionally filtered by status and owner. */
  list(status?: JobStatus, userId?: string): Job[] {
    const where: string[] = []
    const args: string[] = []
    if (status) {
      where.push('status = ?')
      args.push(status)
    }
    if (userId !== undefined) {
      where.push('user_id = ?')
      args.push(userId)
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
    const rows = this.db
      .prepare(`SELECT * FROM jobs${clause} ORDER BY rowid DESC`)
      .all(...args) as JobRow[]
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
  if (row.user_id !== null) job.userId = row.user_id
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
