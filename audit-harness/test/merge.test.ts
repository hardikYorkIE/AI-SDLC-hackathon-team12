import assert from 'node:assert/strict';
import test from 'node:test';
import { compareRuns } from '../src/merge/compareRuns.ts';
import { finalizeFindings } from '../src/merge/findingsMerger.ts';
import { makeFinding } from './helpers.ts';

test('merger keeps the higher severity and assigns stable ids', () => {
  const findings = finalizeFindings(
    [
      makeFinding({ ruleId: 'label', selector: '#card', severity: 'minor', confidence: 'high' }),
      makeFinding({ ruleId: 'label', selector: '#card', severity: 'critical', confidence: 'low' }),
      makeFinding({ ruleId: 'font-scale', selector: '#note', severity: 'serious' }),
      makeFinding({ ruleId: 'spacing-grid', selector: '#a', severity: 'minor' }),
    ],
    2,
  );
  assert.equal(findings.length, 2);
  assert.equal(findings[0].id, 'find_001');
  assert.equal(findings[0].ruleId, 'label');
  assert.equal(findings[0].severity, 'critical');
  assert.equal(findings[1].id, 'find_002');
  assert.equal(findings[1].severity, 'serious');
});

test('re-audit marks a finding resolved when the selector and rule are gone', () => {
  const before = [makeFinding({ id: 'find_001', ruleId: 'label', selector: '#card', severity: 'critical' })];
  const after = [makeFinding({ id: 'find_009', ruleId: 'font-scale', selector: '#note', severity: 'serious' })];
  const verification = compareRuns(before, after, {
    beforeRunId: 'run_before',
    reauditRunId: 'run_after',
    pixelDiffPercent: 1.2,
  });
  assert.equal(verification.results[0].status, 'resolved');
  assert.equal(verification.results[0].reauditRunId, 'run_after');
  assert.equal(verification.pixelDiffPercent, 1.2);

  const stillOpen = compareRuns(before, before, {
    beforeRunId: 'run_before',
    reauditRunId: 'run_after',
    pixelDiffPercent: 0,
  });
  assert.equal(stillOpen.results[0].status, 'open');
});
