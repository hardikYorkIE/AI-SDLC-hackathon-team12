import { existsSync } from 'node:fs';
import path from 'node:path';

export function createRunId(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 16).replace(':', '') + 'Z';
  return `run_${stamp}`;
}

export function createUniqueRunId(runsDir: string, now = new Date()): string {
  const base = createRunId(now);
  let id = base;
  let n = 2;
  while (existsSync(path.join(runsDir, id))) {
    id = `${base}-${n++}`;
  }
  return id;
}

export function findRepoRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}
