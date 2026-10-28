import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateGate } from '../src/gate/evaluateGate.ts';
import { summarizeFindings } from '../src/gate/summarize.ts';
import { makeFinding, model } from './helpers.ts';

test('score subtracts weighted severities and ignores low confidence', () => {
  const summary = summarizeFindings([
    makeFinding({ ruleId: 'a', selector: 'a', severity: 'critical' }),
    makeFinding({ ruleId: 'b', selector: 'b', severity: 'serious' }),
    makeFinding({ ruleId: 'c', selector: 'c', severity: 'moderate' }),
    makeFinding({ ruleId: 'd', selector: 'd', severity: 'minor' }),
    makeFinding({ ruleId: 'e', selector: 'e', severity: 'critical', confidence: 'low' }),
  ]);
  assert.deepEqual(summary, { critical: 1, serious: 1, moderate: 1, minor: 1, score: 82 });
});

test('gate passes at the threshold and fails on critical findings or a low score', () => {
  const threshold = model.gate;
  const pass = evaluateGate({ critical: 0, serious: 4, moderate: 0, minor: 0, score: 80 }, threshold);
  assert.equal(pass.pass, true);
  assert.deepEqual(pass.blockedBy, []);

  const lowScore = evaluateGate({ critical: 0, serious: 0, moderate: 0, minor: 21, score: 79 }, threshold);
  assert.equal(lowScore.pass, false);
  assert.deepEqual(lowScore.blockedBy, ['score']);

  const critical = makeFinding({ id: 'find_001', ruleId: 'label', selector: '#card', severity: 'critical' });
  const blocked = evaluateGate({ critical: 1, serious: 0, moderate: 0, minor: 0, score: 90 }, threshold, [critical]);
  assert.equal(blocked.pass, false);
  assert.deepEqual(blocked.blockedBy, ['find_001']);

  const incomplete = evaluateGate({ critical: 0, serious: 0, moderate: 0, minor: 0, score: 100 }, threshold, [], {
    incomplete: true,
  });
  assert.equal(incomplete.pass, false);
  assert.equal(incomplete.blockedBy[0], 'audit-incomplete');
});
