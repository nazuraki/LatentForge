import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import Database from 'better-sqlite3'

export type Role = 'admin' | 'user'

export interface User {
  id: string
  username: string
  role: Role
  disabled: boolean
  /** Model-tag grants: the user may run models whose tags are all granted. */
  tags: string[]
  createdAt: string
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL,
  disabled      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_tags (
  user_id TEXT NOT NULL,
  tag     TEXT NOT NULL,
  PRIMARY KEY (user_id, tag)
);
CREATE TABLE IF NOT EXISTS model_tags (
  model TEXT NOT NULL,
  tag   TEXT NOT NULL,
  PRIMARY KEY (model, tag)
);
`

// ── Password hashing (scrypt, no external dependency) ───────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const hash = Buffer.from(hashHex, 'hex')
  const test = scryptSync(password, Buffer.from(saltHex, 'hex'), hash.length)
  return hash.length === test.length && timingSafeEqual(hash, test)
}

/** Sessions store only the token's hash; a DB leak can't replay live sessions. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

interface UserRow {
  id: string
  username: string
  password_hash: string
  role: Role
  disabled: number
  created_at: string
}

/**
 * Local accounts, browser sessions, and per-user model access, persisted in the
 * shared SQLite file (separate connection; WAL makes that safe within one
 * process). Unset dbPath = in-memory (dev/tests).
 */
export class UserStore {
  private db: Database.Database

  constructor(dbPath = ':memory:') {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(SCHEMA)
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }
    return row.n
  }

  create(username: string, password: string, role: Role = 'user'): User {
    const now = new Date().toISOString()
    const id = randomUUID()
    try {
      this.db
        .prepare(
          `INSERT INTO users (id, username, password_hash, role, disabled, created_at)
           VALUES (?, ?, ?, ?, 0, ?)`,
        )
        .run(id, username, hashPassword(password), role, now)
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE')) {
        throw new UsernameTakenError(username)
      }
      throw err
    }
    return this.get(id) as User
  }

  get(id: string): User | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
    return row && this.rowToUser(row)
  }

  list(): User[] {
    const rows = this.db.prepare('SELECT * FROM users ORDER BY created_at, id').all() as UserRow[]
    return rows.map((row) => this.rowToUser(row))
  }

  /** Null on unknown username, wrong password, or a disabled account. */
  verifyCredentials(username: string, password: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
      | UserRow
      | undefined
    if (!row || row.disabled) return null
    if (!verifyPassword(password, row.password_hash)) return null
    return this.rowToUser(row)
  }

  /** Disabling revokes the user's sessions; they are cut off immediately. */
  setDisabled(id: string, disabled: boolean): User {
    const user = this.mustGet(id)
    if (disabled) this.guardLastAdmin(user)
    this.db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, id)
    if (disabled) this.db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(id)
    return this.get(id) as User
  }

  setRole(id: string, role: Role): User {
    const user = this.mustGet(id)
    if (role !== 'admin') this.guardLastAdmin(user)
    this.db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id)
    return this.get(id) as User
  }

  /** Admin password reset; revokes the user's sessions. */
  setPassword(id: string, password: string): void {
    this.mustGet(id)
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id)
    this.db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(id)
  }

  setTags(id: string, tags: string[]): User {
    this.mustGet(id)
    const replace = this.db.transaction(() => {
      this.db.prepare('DELETE FROM user_tags WHERE user_id = ?').run(id)
      for (const tag of new Set(tags)) {
        this.db.prepare('INSERT INTO user_tags (user_id, tag) VALUES (?, ?)').run(id, tag)
      }
    })
    replace()
    return this.get(id) as User
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  createSession(userId: string): { token: string; expiresAt: Date } {
    this.db.prepare('DELETE FROM user_sessions WHERE expires_at < ?').run(new Date().toISOString())
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    this.db
      .prepare('INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(hashToken(token), userId, expiresAt.toISOString())
    return { token, expiresAt }
  }

  /** Resolve a session token to its (enabled) user; expired sessions are dropped. */
  userForSession(token: string): User | undefined {
    const row = this.db
      .prepare('SELECT * FROM user_sessions WHERE token_hash = ?')
      .get(hashToken(token)) as { user_id: string; expires_at: string } | undefined
    if (!row) return undefined
    if (Date.parse(row.expires_at) < Date.now()) {
      this.revokeSession(token)
      return undefined
    }
    const user = this.get(row.user_id)
    return user && !user.disabled ? user : undefined
  }

  revokeSession(token: string): void {
    this.db.prepare('DELETE FROM user_sessions WHERE token_hash = ?').run(hashToken(token))
  }

  // ── Model access ──────────────────────────────────────────────────────────

  /** All model → tags assignments (models without tags are absent). */
  modelTags(): Record<string, string[]> {
    const rows = this.db.prepare('SELECT model, tag FROM model_tags ORDER BY model, tag').all() as {
      model: string
      tag: string
    }[]
    const out: Record<string, string[]> = {}
    for (const { model, tag } of rows) (out[model] ??= []).push(tag)
    return out
  }

  setModelTags(model: string, tags: string[]): void {
    const replace = this.db.transaction(() => {
      this.db.prepare('DELETE FROM model_tags WHERE model = ?').run(model)
      for (const tag of new Set(tags)) {
        this.db.prepare('INSERT INTO model_tags (model, tag) VALUES (?, ?)').run(model, tag)
      }
    })
    replace()
  }

  /** Untagged models are open to everyone; tagged ones need every tag granted. */
  canUseModel(user: Pick<User, 'role' | 'tags'>, model: string): boolean {
    if (user.role === 'admin') return true
    const rows = this.db.prepare('SELECT tag FROM model_tags WHERE model = ?').all(model) as {
      tag: string
    }[]
    return rows.every(({ tag }) => user.tags.includes(tag))
  }

  filterModels(user: Pick<User, 'role' | 'tags'>, models: string[]): string[] {
    return models.filter((model) => this.canUseModel(user, model))
  }

  close(): void {
    this.db.close()
  }

  private mustGet(id: string): User {
    const user = this.get(id)
    if (!user) throw new UserNotFoundError(id)
    return user
  }

  /** Refuse changes that would leave the system without an enabled admin. */
  private guardLastAdmin(user: User): void {
    if (user.role !== 'admin' || user.disabled) return
    const others = this.db
      .prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0 AND id != ?`)
      .get(user.id) as { n: number }
    if (others.n === 0) throw new LastAdminError()
  }

  private rowToUser(row: UserRow): User {
    const tags = this.db.prepare('SELECT tag FROM user_tags WHERE user_id = ? ORDER BY tag').all(
      row.id,
    ) as { tag: string }[]
    return {
      id: row.id,
      username: row.username,
      role: row.role,
      disabled: row.disabled === 1,
      tags: tags.map(({ tag }) => tag),
      createdAt: row.created_at,
    }
  }
}

export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`user not found: ${id}`)
  }
}

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`username already taken: ${username}`)
  }
}

export class LastAdminError extends Error {
  constructor() {
    super('cannot disable or demote the last admin')
  }
}
