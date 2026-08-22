import { describe, expect, it } from 'vitest'
import { AccessStore } from './store.ts'

describe('AccessStore', () => {
  it('assigns model tags and dedupes them', () => {
    const store = new AccessStore()
    store.setModelTags('spicy-xl', ['nsfw', 'nsfw', 'beta'])
    expect(store.modelTags()).toEqual({ 'spicy-xl': ['beta', 'nsfw'] })
    store.setModelTags('spicy-xl', [])
    expect(store.modelTags()).toEqual({})
  })

  it('opens untagged models to everyone and requires every tag otherwise', () => {
    const store = new AccessStore()
    store.setModelTags('spicy-xl', ['nsfw', 'beta'])
    const plain = { role: 'user' as const, tags: [] }
    const partial = { role: 'user' as const, tags: ['nsfw'] }
    const full = { role: 'user' as const, tags: ['nsfw', 'beta'] }
    expect(store.canUseModel(plain, 'sdxl-1.0')).toBe(true)
    expect(store.canUseModel(plain, 'spicy-xl')).toBe(false)
    expect(store.canUseModel(partial, 'spicy-xl')).toBe(false)
    expect(store.canUseModel(full, 'spicy-xl')).toBe(true)
    expect(store.canUseModel({ role: 'admin', tags: [] }, 'spicy-xl')).toBe(true)
    expect(store.filterModels(partial, ['sdxl-1.0', 'spicy-xl'])).toEqual(['sdxl-1.0'])
  })
})
