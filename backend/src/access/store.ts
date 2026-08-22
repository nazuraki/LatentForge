import Database from 'better-sqlite3'
import type { Principal } from '../auth.ts'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS model_tags (
  model TEXT NOT NULL,
  tag   TEXT NOT NULL,
  PRIMARY KEY (model, tag)
);
`

/**
 * Per-model access tags, persisted in the shared SQLite file (separate
 * connection; WAL makes that safe within one process). Who holds which tags is
 * usr's business — a user's tags are their latentforge roles — so this store
 * only knows which tags each model demands. Unset dbPath = in-memory (dev/tests).
 */
export class AccessStore {
  private db: Database.Database

  constructor(dbPath = ':memory:') {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(SCHEMA)
  }

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
  canUseModel(user: Pick<Principal, 'role' | 'tags'>, model: string): boolean {
    if (user.role === 'admin') return true
    const rows = this.db.prepare('SELECT tag FROM model_tags WHERE model = ?').all(model) as {
      tag: string
    }[]
    return rows.every(({ tag }) => user.tags.includes(tag))
  }

  filterModels(user: Pick<Principal, 'role' | 'tags'>, models: string[]): string[] {
    return models.filter((model) => this.canUseModel(user, model))
  }

  close(): void {
    this.db.close()
  }
}
