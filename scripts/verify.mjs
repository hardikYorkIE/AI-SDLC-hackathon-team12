import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const demo = spawn(path.join(root, 'demo-app/node_modules/.bin/vite'), ['--port', '5173', '--strictPort'], {
  cwd: path.join(root, 'demo-app'),
  stdio: 'inherit',
  detached: true,
});
let stopped = false;

function stopDemo() {
  if (stopped || !demo.pid) return;
  stopped = true;
  try {
    process.kill(-demo.pid, 'SIGTERM');
  } catch {
    demo.kill('SIGTERM');
  }
}

process.on('exit', stopDemo);
process.on('SIGINT', () => {
  stopDemo();
  process.exit(1);
});

try {
  await waitFor('http://localhost:5173/good-landing');
  await expectCode(['test'], 0);
  await expectCode(['audit:gate', '--', '--url', 'http://localhost:5173/broken-checkout'], 1);
  await expectCode(['audit:gate', '--', '--url', 'http://localhost:5173/broken-dashboard'], 1);
  await expectCode(['audit:gate', '--', '--url', 'http://localhost:5173/good-landing'], 0);
  await expectCode(['audit:gate', '--', '--url', 'http://localhost:5173/new-feature'], 1);
  await expectCode(
    ['audit:gate', '--', '--url', 'http://localhost:5173/new-feature', '--fix', 'audit-harness/fixes/new-feature.json'],
    0,
  );
  await expectCode(
    ['audit:gate', '--', '--url', 'http://localhost:5173/broken-checkout', '--fix', 'audit-harness/fixes/broken-checkout.json'],
    0,
  );
  await expectCode(
    ['audit:gate', '--', '--url', 'http://localhost:5173/broken-dashboard', '--fix', 'audit-harness/fixes/broken-dashboard.json'],
    0,
  );
  await expectCode(['run', 'audit', '--', '--url', 'http://localhost:5173/broken-checkout'], 0);
  const before = readFileSync(path.join(root, 'runs', 'latest.txt'), 'utf8').trim();
  if (!/^run_[\w.:-]+$/.test(before)) throw new Error(`Unexpected run id ${before}`);
  await expectCode(
    [
      'run',
      'audit',
      '--',
      '--url',
      'http://localhost:5173/broken-checkout',
      '--fix',
      'audit-harness/fixes/broken-checkout.json',
      '--before',
      before,
    ],
    0,
  );
  const after = readFileSync(path.join(root, 'runs', 'latest.txt'), 'utf8').trim();
  const verification = JSON.parse(readFileSync(path.join(root, 'runs', after, 'verification.json'), 'utf8'));
  const resolved = verification.results.filter((item) => item.status === 'resolved');
  if (resolved.length < 1) throw new Error('expected at least one resolved finding');
  if (!(verification.pixelDiffPercent > 0)) {
    throw new Error(`expected a visible pixel diff, got ${verification.pixelDiffPercent}`);
  }
  await expectCode(['eval:fixtures'], 0);
  console.log('verify: all checks passed');
} finally {
  stopDemo();
}

function expectCode(args, expected) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', args, { stdio: 'inherit', cwd: root });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === expected) resolve();
      else reject(new Error(`pnpm ${args.join(' ')} exited ${code}, expected ${expected}`));
    });
  });
}

async function waitFor(url) {
  for (let attempt = 1; attempt <= 60; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
