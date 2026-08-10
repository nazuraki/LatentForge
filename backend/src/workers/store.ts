import { randomUUID } from 'node:crypto'

export interface WorkerRegistration {
  name: string
  models?: string[]
}

export interface Worker {
  id: string
  name: string
  models: string[]
  registeredAt: string
  lastSeenAt: string
}

export interface WorkerView extends Worker {
  online: boolean
}

const DEFAULT_STALE_AFTER_MS = 60_000

export class WorkerStore {
  private workers = new Map<string, Worker>()
  private staleAfterMs: number

  constructor(staleAfterMs = DEFAULT_STALE_AFTER_MS) {
    this.staleAfterMs = staleAfterMs
  }

  register(registration: WorkerRegistration): WorkerView {
    const now = new Date().toISOString()
    const worker: Worker = {
      id: randomUUID(),
      name: registration.name,
      models: registration.models ?? [],
      registeredAt: now,
      lastSeenAt: now,
    }
    this.workers.set(worker.id, worker)
    return this.view(worker)
  }

  get(id: string): WorkerView | undefined {
    const worker = this.workers.get(id)
    return worker && this.view(worker)
  }

  list(): WorkerView[] {
    return [...this.workers.values()]
      .sort((a, b) => a.registeredAt.localeCompare(b.registeredAt))
      .map((w) => this.view(w))
  }

  /** Record a heartbeat; returns undefined for unknown workers. */
  heartbeat(id: string): WorkerView | undefined {
    const worker = this.workers.get(id)
    if (!worker) return undefined
    worker.lastSeenAt = new Date().toISOString()
    return this.view(worker)
  }

  private view(worker: Worker): WorkerView {
    const online = Date.now() - Date.parse(worker.lastSeenAt) < this.staleAfterMs
    return { ...worker, online }
  }
}
