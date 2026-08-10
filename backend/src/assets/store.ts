import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

export function contentTypeFor(name: string): string | undefined {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  return CONTENT_TYPES[ext]
}

export function isSafeAssetName(name: string): boolean {
  return SAFE_NAME.test(name) && !name.includes('..') && contentTypeFor(name) !== undefined
}

export class AssetStore {
  private dir: string
  private ready: Promise<void> | undefined

  constructor(dir: string) {
    this.dir = dir
  }

  private ensureDir(): Promise<void> {
    this.ready ??= mkdir(this.dir, { recursive: true }).then(() => undefined)
    return this.ready
  }

  async save(name: string, data: Buffer): Promise<void> {
    if (!isSafeAssetName(name)) throw new Error(`unsafe asset name: ${name}`)
    await this.ensureDir()
    await writeFile(join(this.dir, name), data)
  }

  async read(name: string): Promise<Buffer | undefined> {
    if (!isSafeAssetName(name)) return undefined
    try {
      return await readFile(join(this.dir, name))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw err
    }
  }
}
