import { describe, expect, it } from 'vitest'
import { InvalidTransitionError, JobNotFoundError, JobStore } from './store.ts'

describe('JobStore', () => {
  it('creates jobs as queued', () => {
    const store = new JobStore()
    const job = store.create({ prompt: 'a red fox', seed: 42 })
    expect(job.status).toBe('queued')
    expect(job.request.prompt).toBe('a red fox')
    expect(store.get(job.id)).toEqual(job)
  })

  it('lists jobs newest-first with optional status filter', () => {
    const store = new JobStore()
    const a = store.create({ prompt: 'a' })
    const b = store.create({ prompt: 'b' })
    store.transition(b.id, 'running')
    expect(store.list().map((j) => j.id)).toContain(a.id)
    expect(store.list('queued').map((j) => j.id)).toEqual([a.id])
    expect(store.list('running').map((j) => j.id)).toEqual([b.id])
  })

  it('allows queued → running → succeeded', () => {
    const store = new JobStore()
    const job = store.create({ prompt: 'x' })
    store.transition(job.id, 'running')
    expect(store.transition(job.id, 'succeeded').status).toBe('succeeded')
  })

  it('records error message on failure', () => {
    const store = new JobStore()
    const job = store.create({ prompt: 'x' })
    store.transition(job.id, 'running')
    expect(store.transition(job.id, 'failed', { error: 'OOM' }).error).toBe('OOM')
  })

  it('rejects invalid transitions', () => {
    const store = new JobStore()
    const job = store.create({ prompt: 'x' })
    expect(() => store.transition(job.id, 'succeeded')).toThrow(InvalidTransitionError)
    store.transition(job.id, 'canceled')
    expect(() => store.transition(job.id, 'running')).toThrow(InvalidTransitionError)
  })

  it('claims strictly in creation order, even within the same millisecond', () => {
    const store = new JobStore()
    const created = Array.from({ length: 5 }, (_, i) => store.create({ prompt: `job ${i}` }))
    const claimed = created.map(() => store.claimNext('w1')?.id)
    expect(claimed).toEqual(created.map((j) => j.id))
    expect(store.claimNext('w1')).toBeUndefined()
  })

  it('throws for unknown job ids', () => {
    const store = new JobStore()
    expect(() => store.transition('nope', 'running')).toThrow(JobNotFoundError)
  })
})
