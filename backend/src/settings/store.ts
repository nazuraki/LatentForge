import Database from 'better-sqlite3'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

/**
 * Key/value settings persisted in the same SQLite file as the job store
 * (separate connection; WAL makes that safe within one process).
 * Unset dbPath = in-memory (dev/tests).
 */
export class SettingsStore {
  private db: Database.Database

  constructor(dbPath = ':memory:') {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(SCHEMA)
  }

  get(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, value)
  }

  close(): void {
    this.db.close()
  }
}

export const WORKER_TOKEN_KEY = 'workerToken'
