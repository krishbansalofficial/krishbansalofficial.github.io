import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

// A tiny durable JSON document. Writes are serialized through a promise chain
// (so two concurrent requests can't interleave read-modify-write) and land via
// write-to-temp + rename, so a crash mid-write never leaves a truncated file.
export class JsonStore {
  constructor(file, initial) {
    this.file = file;
    this.initial = initial;
    this.queue = Promise.resolve();
  }

  async read() {
    try {
      return JSON.parse(await readFile(this.file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return structuredClone(this.initial);
      throw err;
    }
  }

  update(mutate) {
    const run = this.queue.then(async () => {
      const data = await this.read();
      const result = mutate(data);
      await mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(data, null, 2));
      await rename(tmp, this.file);
      return result;
    });
    // Keep the chain alive even if this write fails.
    this.queue = run.catch(() => {});
    return run;
  }
}
