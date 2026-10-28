import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export function diffPng(
  beforePath: string,
  afterPath: string,
  diffPath: string,
): { percent: number } | { percent: null; reason: string } {
  const before = PNG.sync.read(readFileSync(beforePath));
  const after = PNG.sync.read(readFileSync(afterPath));
  if (before.width !== after.width || before.height !== after.height) {
    return { percent: null, reason: `dimension mismatch ${before.width}x${before.height} vs ${after.width}x${after.height}` };
  }
  const diff = new PNG({ width: before.width, height: before.height });
  const mismatched = pixelmatch(before.data, after.data, diff.data, before.width, before.height, { threshold: 0.1 });
  writeFileSync(diffPath, PNG.sync.write(diff));
  const percent = (mismatched / (before.width * before.height)) * 100;
  return { percent: Math.round(percent * 10) / 10 };
}
