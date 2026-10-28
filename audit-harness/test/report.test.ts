import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCliArgs } from '../src/cli/parseArgs.ts';
import { escapeHtml, renderHtml } from '../src/report/renderHtml.ts';
import type { ReportFile } from '../src/types.ts';
import { makeFinding } from './helpers.ts';

test('cli requires a url for audit commands and keeps heuristics on by default', () => {
  const help = parseCliArgs([]);
  assert.equal(help.ok, true);
  if (help.ok) assert.equal(help.value.command, 'help');
  const missing = parseCliArgs(['gate']);
  assert.equal(missing.ok, false);
  const gate = parseCliArgs(['gate', '--url', 'http://localhost:5173/good-landing', '--no-heuristic']);
  assert.equal(gate.ok, true);
  if (gate.ok) {
    assert.equal(gate.value.url, 'http://localhost:5173/good-landing');
    assert.equal(gate.value.heuristic, false);
    assert.equal(gate.value.ollama, false);
  }
  const audit = parseCliArgs(['audit', '--url=http://localhost:5173/broken-checkout', '--ollama', '--fix', 'fixes/a.json']);
  assert.equal(audit.ok, true);
  if (audit.ok) {
    assert.equal(audit.value.fixPath, 'fixes/a.json');
    assert.equal(audit.value.ollama, true);
    assert.equal(audit.value.heuristic, true);
  }
  assert.equal(parseCliArgs(['nope']).ok, false);
  const forwarded = parseCliArgs(['gate', '--', '--url', 'http://localhost:5173/good-landing']);
  assert.equal(forwarded.ok, true);
  if (forwarded.ok) assert.equal(forwarded.value.url, 'http://localhost:5173/good-landing');
});

test('html report escapes untrusted finding text and states the audit limit', () => {
  const finding = makeFinding({
    id: 'find_001',
    ruleId: 'label',
    selector: '#card',
    severity: 'critical',
    title: '<script>alert(1)</script>',
    description: 'Missing label',
  });
  const report: ReportFile = {
    run: {
      id: 'run_test',
      target: { url: 'http://localhost:5173/broken-checkout', viewport: { width: 1280, height: 800 } },
      startedAt: '2026-10-28T09:30:00Z',
      tracks: ['deterministic'],
      artifactDir: 'runs/run_test',
      summary: { critical: 1, serious: 0, moderate: 0, minor: 0, score: 90 },
      gate: {
        runId: 'run_test',
        pass: false,
        threshold: { minScore: 80, maxCritical: 0 },
        actual: { critical: 1, serious: 0, moderate: 0, minor: 0, score: 90 },
        blockedBy: ['find_001'],
      },
    },
    findings: [finding],
    proposedFixes: [],
  };
  const html = renderHtml(report);
  assert.match(html, /not a legal compliance determination/);
  assert.match(html, /not a substitute for usability testing/);
  assert.equal(html.includes('<script>alert'), false);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal(escapeHtml('"&'), '&quot;&amp;');
});
