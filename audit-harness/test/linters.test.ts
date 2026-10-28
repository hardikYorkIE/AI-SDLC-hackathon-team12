import assert from 'node:assert/strict';
import test from 'node:test';
import { lintFonts } from '../src/tracks/fontLinter.ts';
import { lintHeuristics } from '../src/tracks/heuristicTrack.ts';
import { lintSpacing } from '../src/tracks/spacingLinter.ts';
import { makeFinding, model, sample } from './helpers.ts';

test('spacing linter flags off-grid measurements on marked elements only', () => {
  const findings = lintSpacing(
    [
      sample({ selector: '#ignored', auditSpacing: false, spacing: [{ property: 'marginTop', px: 7 }] }),
      sample({
        selector: '#stat-grid',
        auditSpacing: true,
        spacing: [
          { property: 'marginTop', px: 7 },
          { property: 'paddingTop', px: 16 },
        ],
      }),
      sample({
        selector: '#filters',
        auditSpacing: true,
        spacing: [
          { property: 'marginTop', px: 15 },
          { property: 'paddingTop', px: 15 },
        ],
      }),
      sample({ selector: '#ok', auditSpacing: true, spacing: [{ property: 'marginTop', px: 8 }] }),
    ],
    model,
    '/broken-dashboard',
  );
  assert.equal(findings.length, 2);
  assert.deepEqual(findings.map((finding) => finding.selector), ['#stat-grid', '#filters']);
  assert.equal(findings[0].ruleId, 'spacing-grid');
  assert.equal(findings[0].severity, 'serious');
  assert.equal(findings[0].details?.[0].suggestedPx, 8);
  assert.equal(findings[1].details?.[0].suggestedPx, 16);
  assert.equal(findings[1].details?.[1].suggestedPx, 16);
});

test('font linter ignores inherited sizes and allows the configured scale', () => {
  const findings = lintFonts(
    [
      sample({ selector: 'p', fontSizePx: 13, fontSizeExplicit: false }),
      sample({ selector: '#billing-note', fontSizePx: 13, fontSizeExplicit: true }),
      sample({ selector: 'h1', fontSizePx: 32, fontSizeExplicit: true }),
    ],
    model,
    '/broken-checkout',
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].selector, '#billing-note');
  assert.equal(findings[0].ruleId, 'font-scale');
  assert.equal(findings[0].details?.[0].suggestedPx, 14);
});

test('heuristic track reports competing h1s, skipped levels, and extra primary buttons', () => {
  const findings = lintHeuristics(
    {
      title: 'Demo',
      headings: [
        { level: 1, text: 'Dashboard', selector: 'h1' },
        { level: 1, text: 'Revenue', selector: '#revenue-heading' },
        { level: 3, text: 'Detail', selector: '#detail' },
      ],
      primaryButtons: [
        { selector: '#a', text: 'Save' },
        { selector: '#b', text: 'Publish' },
      ],
      samples: [],
    },
    '/broken-dashboard',
  );
  assert.deepEqual(
    findings.map((finding) => finding.ruleId),
    ['multiple-h1', 'heading-skip', 'multiple-primary-buttons'],
  );
  assert.equal(findings[0].confidence, 'medium');
  assert.equal(findings[2].severity, 'minor');
  assert.equal(makeFinding({ ruleId: 'x', selector: 'y', severity: 'minor' }).verificationStatus, 'open');
});
