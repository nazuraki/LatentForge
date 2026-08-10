import { describe, expect, it, vi } from 'vitest'
import { WorkerStore } from './store.ts'

describe('WorkerStore', () => {
  it('registers workers as online with defaulted models', () => {
    const store = new WorkerStore()
    const worker = store.register({ name: 'gpu-1' })
    expect(worker.online).toBe(true)
    expect(worker.models).toEqual([])
    expect(store.get(worker.id)?.name).toBe('gpu-1')
  })

  it('lists workers in registration order', () => {
    const store = new WorkerStore()
    const a = store.register({ name: 'a' })
    const b = store.register({ name: 'b' })
    expect(store.list().map((w) => w.id)).toEqual([a.id, b.id])
  })

  it('marks workers offline once heartbeats go stale', () => {
    vi.useFakeTimers()
    try {
      const store = new WorkerStore(1000)
      const worker = store.register({ name: 'gpu-1' })
      vi.advanceTimersByTime(1500)
      expect(store.get(worker.id)?.online).toBe(false)
      store.heartbeat(worker.id)
      expect(store.get(worker.id)?.online).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns undefined for heartbeats from unknown workers', () => {
    expect(new WorkerStore().heartbeat('nope')).toBeUndefined()
  })
})
