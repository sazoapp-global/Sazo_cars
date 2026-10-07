// Where evidence bytes live. Objects are WRITE-ONCE: a key can be written a single time and never changed
// (the hash in obs.evidence_files must keep matching the bytes). Local folder for now; S3 with Object Lock later.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface ObjectStore {
  /** Store bytes under a new key. Fails if the key already exists. */
  putOnce(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | undefined>;
}

export const OBJECT_STORE = Symbol('OBJECT_STORE');

export class LocalObjectStore implements ObjectStore {
  constructor(private readonly root: string) {}

  private file(key: string): string {
    if (!/^[a-z0-9/_-]+$/i.test(key) || key.includes('..')) throw new Error('invalid storage key');
    return path.join(this.root, key);
  }

  async putOnce(key: string, bytes: Buffer): Promise<void> {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, bytes, { flag: 'wx', mode: 0o440 }); // 'wx' = fail if it exists
  }

  async get(key: string): Promise<Buffer | undefined> {
    try {
      return await readFile(this.file(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw err;
    }
  }
}
