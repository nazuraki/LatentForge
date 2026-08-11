import { describe, expect, it } from 'vitest'
import {
  hashPassword,
  LastAdminError,
  UsernameTakenError,
  UserStore,
  verifyPassword,
} from './store.ts'

describe('password hashing', () => {
  it('round-trips and rejects wrong passwords', () => {
    const stored = hashPassword('hunter2hunter2')
    expect(stored).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/)
    expect(verifyPassword('hunter2hunter2', stored)).toBe(true)
    expect(verifyPassword('wrong', stored)).toBe(false)
    expect(verifyPassword('hunter2hunter2', 'garbage')).toBe(false)
  })
})

describe('UserStore accounts', () => {
  it('creates users and rejects duplicate usernames', () => {
    const store = new UserStore()
    const user = store.create('alice', 'password123', 'admin')
    expect(user).toMatchObject({ username: 'alice', role: 'admin', disabled: false, tags: [] })
    expect(store.count()).toBe(1)
    expect(() => store.create('alice', 'other-password')).toThrow(UsernameTakenError)
  })

  it('verifies credentials and rejects wrong password or disabled accounts', () => {
    const store = new UserStore()
    store.create('admin', 'password123', 'admin')
    const bob = store.create('bob', 'password123')
    expect(store.verifyCredentials('bob', 'password123')?.id).toBe(bob.id)
    expect(store.verifyCredentials('bob', 'nope')).toBeNull()
    expect(store.verifyCredentials('ghost', 'password123')).toBeNull()
    store.setDisabled(bob.id, true)
    expect(store.verifyCredentials('bob', 'password123')).toBeNull()
  })

  it('refuses to disable or demote the last enabled admin', () => {
    const store = new UserStore()
    const admin = store.create('admin', 'password123', 'admin')
    expect(() => store.setDisabled(admin.id, true)).toThrow(LastAdminError)
    expect(() => store.setRole(admin.id, 'user')).toThrow(LastAdminError)
    const second = store.create('backup', 'password123', 'admin')
    store.setRole(admin.id, 'user')
    expect(() => store.setDisabled(second.id, true)).toThrow(LastAdminError)
  })

  it('replaces tag grants as a set', () => {
    const store = new UserStore()
    const user = store.create('bob', 'password123')
    expect(store.setTags(user.id, ['nsfw', 'beta', 'nsfw']).tags).toEqual(['beta', 'nsfw'])
    expect(store.setTags(user.id, ['beta']).tags).toEqual(['beta'])
  })
})

describe('UserStore sessions', () => {
  it('resolves a live session and revokes on logout', () => {
    const store = new UserStore()
    const user = store.create('bob', 'password123')
    const { token, expiresAt } = store.createSession(user.id)
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now())
    expect(store.userForSession(token)?.id).toBe(user.id)
    store.revokeSession(token)
    expect(store.userForSession(token)).toBeUndefined()
  })

  it('rejects unknown tokens and sessions of disabled users', () => {
    const store = new UserStore()
    store.create('admin', 'password123', 'admin')
    const bob = store.create('bob', 'password123')
    const { token } = store.createSession(bob.id)
    expect(store.userForSession('not-a-token')).toBeUndefined()
    store.setDisabled(bob.id, true)
    expect(store.userForSession(token)).toBeUndefined()
  })

  it('revokes sessions on password reset', () => {
    const store = new UserStore()
    const bob = store.create('bob', 'password123')
    const { token } = store.createSession(bob.id)
    store.setPassword(bob.id, 'new-password-123')
    expect(store.userForSession(token)).toBeUndefined()
    expect(store.verifyCredentials('bob', 'new-password-123')?.id).toBe(bob.id)
  })
})

describe('UserStore model access', () => {
  it('gates tagged models on grants and leaves untagged models open', () => {
    const store = new UserStore()
    const bob = store.create('bob', 'password123')
    store.setModelTags('spicy-xl', ['nsfw'])
    expect(store.canUseModel(bob, 'sdxl-1.0')).toBe(true)
    expect(store.canUseModel(bob, 'spicy-xl')).toBe(false)
    const granted = store.setTags(bob.id, ['nsfw'])
    expect(store.canUseModel(granted, 'spicy-xl')).toBe(true)
  })

  it('requires every tag on a multi-tagged model', () => {
    const store = new UserStore()
    const bob = store.create('bob', 'password123')
    store.setModelTags('experimental-nsfw', ['nsfw', 'beta'])
    expect(store.canUseModel(store.setTags(bob.id, ['nsfw']), 'experimental-nsfw')).toBe(false)
    expect(store.canUseModel(store.setTags(bob.id, ['nsfw', 'beta']), 'experimental-nsfw')).toBe(
      true,
    )
  })

  it('lets admins use everything and filters lists for users', () => {
    const store = new UserStore()
    const admin = store.create('admin', 'password123', 'admin')
    const bob = store.create('bob', 'password123')
    store.setModelTags('spicy-xl', ['nsfw'])
    const models = ['sdxl-1.0', 'spicy-xl']
    expect(store.filterModels(admin, models)).toEqual(models)
    expect(store.filterModels(bob, models)).toEqual(['sdxl-1.0'])
  })

  it('replaces and clears model tags', () => {
    const store = new UserStore()
    store.setModelTags('spicy-xl', ['nsfw', 'nsfw', 'beta'])
    expect(store.modelTags()).toEqual({ 'spicy-xl': ['beta', 'nsfw'] })
    store.setModelTags('spicy-xl', [])
    expect(store.modelTags()).toEqual({})
  })
})
