import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSafeFix } from '../src/fix/injectCss.ts';
import { proposeFixes } from '../src/fix/proposeFixes.ts';
import { makeFinding } from './helpers.ts';

test('proposed fixes turn measured spacing and type into CSS and leave the rest for a person', () => {
  const fixes = proposeFixes([
    makeFinding({
      id: 'find_001',
      ruleId: 'font-scale',
      selector: '#billing-note',
      severity: 'serious',
      details: [{ property: 'fontSize', px: 13, suggestedPx: 14 }],
    }),
    makeFinding({
      id: 'find_002',
      ruleId: 'spacing-grid',
      selector: '#filters',
      severity: 'serious',
      details: [{ property: 'marginTop', px: 15, suggestedPx: 16 }],
    }),
    makeFinding({ id: 'find_003', ruleId: 'label', selector: '#card', severity: 'critical', recommendedAction: 'Add a label' }),
  ]);
  assert.equal(fixes[0].patch, '#billing-note { font-size: 14px; }');
  assert.equal(fixes[0].requiresHumanApproval, true);
  assert.equal(fixes[1].patch, '#filters { margin-top: 16px; }');
  assert.equal(fixes[2].type, 'manual');
  assert.equal(fixes[2].patch, 'Add a label');
});

test('fix manifests reject scripts, handlers, and empty patches', () => {
  assert.throws(() => assertSafeFix({}), /nothing to apply/);
  assert.throws(() => assertSafeFix({ css: '</style><script>' }), /style tag/);
  assert.throws(() => assertSafeFix({ attributes: [{ selector: '#a', name: 'onerror', value: 'alert(1)' }] }), /not allowed/);
  assert.throws(
    () => assertSafeFix({ inserts: [{ position: 'before', selector: '#a', tag: 'script', text: 'x' }] }),
    /not allowed/,
  );
  assert.throws(
    () => assertSafeFix({ inserts: [{ position: 'before', selector: '#a', tag: 'label', text: '<b>x</b>' }] }),
    /markup/,
  );
  assert.doesNotThrow(() =>
    assertSafeFix({
      css: '.checkout-submit { background-color: #1e3a8a; }',
      inserts: [{ position: 'before', selector: '#card-number', tag: 'label', text: 'Card number', attrs: { for: 'card-number' } }],
    }),
  );
});
