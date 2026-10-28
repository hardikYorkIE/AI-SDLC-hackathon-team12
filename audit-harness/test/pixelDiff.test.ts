import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PNG } from 'pngjs';
import { diffPng } from '../src/diff/pixelDiff.ts';

test('pixel diff reports zero for identical shots and a percent when pixels change', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pixel-diff-'));
  const red = path.join(dir, 'red.png');
  const same = path.join(dir, 'same.png');
  const blue = path.join(dir, 'blue.png');
  const diff = path.join(dir, 'diff.png');
  writeSolid(red, [255, 0, 0]);
  writeSolid(same, [255, 0, 0]);
  writeSolid(blue, [0, 0, 255]);
  assert.equal(diffPng(red, same, path.join(dir, 'none.png')).percent, 0);
  const changed = diffPng(red, blue, diff);
  assert.equal(changed.percent, 100);
});

function writeSolid(file: string, color: [number, number, number]): void {
  const png = new PNG({ width: 2, height: 2 });
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      const index = (png.width * y + x) << 2;
      png.data[index] = color[0];
      png.data[index + 1] = color[1];
      png.data[index + 2] = color[2];
      png.data[index + 3] = 255;
    }
  }
  writeFileSync(file, PNG.sync.write(png));
}
