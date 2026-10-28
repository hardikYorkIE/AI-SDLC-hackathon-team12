import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadQualityModel } from '../src/config/loadQualityModel.ts';
import { matchExpected } from '../src/eval/matchExpected.ts';
import { assertAllowedUrl } from '../src/ingestion/urlPolicy.ts';
import { createRunId } from '../src/runner/runId.ts';
import { model } from './helpers.ts';

test('allowlist accepts loopback hosts and rejects credentials and other sites', () => {
  assert.equal(assertAllowedUrl('http://localhost:5173/broken-checkout', model.allowedHosts).pathname, '/broken-checkout');
  assert.equal(assertAllowedUrl('http://127.0.0.1:5173/', model.allowedHosts).hostname, '127.0.0.1');
  assert.throws(() => assertAllowedUrl('https://example.com', model.allowedHosts), /allowlist/);
  assert.throws(() => assertAllowedUrl('http://user:pass@localhost', model.allowedHosts), /credentials/);
  assert.throws(() => assertAllowedUrl('ftp://localhost', model.allowedHosts), /http/);
});

test('run ids use the plan timestamp shape', () => {
  assert.equal(createRunId(new Date('2026-10-28T09:30:00Z')), 'run_2026-10-28T0930Z');
});

test('fixture recall consumes one match per expected issue', () => {
  const report = matchExpected(
    [
      { route: '/broken-dashboard/', ruleId: 'spacing-grid', description: '7px' },
      { route: '/broken-dashboard', ruleId: 'spacing-grid', description: '15px' },
      { route: '/broken-checkout', ruleId: 'label', description: 'card' },
    ],
    [
      { screen: '/broken-dashboard', ruleId: 'spacing-grid', title: 'Pipeline' },
      { screen: '/broken-dashboard', ruleId: 'button-name', title: 'Name' },
      { screen: '/broken-checkout', ruleId: 'label', title: 'Card' },
    ],
  );
  assert.equal(report.matched, 2);
  assert.equal(report.recall, 2 / 3);
  assert.equal(report.misses[0].description, '15px');
  assert.equal(report.unmatchedFindings.length, 1);
  assert.equal(report.unmatchedFindings[0].ruleId, 'button-name');
});

test('the shipped quality model and expected issues stay loadable', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const loaded = loadQualityModel(path.join(root, 'config/quality-model.json'));
  assert.equal(loaded.gate.minScore, 80);
  assert.equal(loaded.gate.maxCritical, 0);
  assert.equal(loaded.fonts.allowedPx.includes(13), false);
  assert.equal(loaded.allowedHosts.includes('localhost'), true);
  const expected = JSON.parse(readFileSync(path.join(root, 'fixtures/expected-issues.json'), 'utf8')) as Array<{
    route: string;
    ruleId: string;
    description: string;
  }>;
  assert.ok(expected.length >= 8);
  for (const issue of expected) {
    assert.equal(typeof issue.route, 'string');
    assert.equal(typeof issue.ruleId, 'string');
    assert.equal(typeof issue.description, 'string');
  }

  const dir = mkdtempSync(path.join(tmpdir(), 'quality-model-'));
  const bad = path.join(dir, 'bad.json');
  writeFileSync(bad, JSON.stringify({ spacing: { step: 0 } }));
  assert.throws(() => loadQualityModel(bad), /spacing.step/);
});
