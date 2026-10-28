import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAudit } from '../runner/AuditRunner.ts';
import { findRepoRoot } from '../runner/runId.ts';
import { normalizeRoute } from '../ingestion/urlPolicy.ts';
import { matchExpected, type ExpectedIssue } from './matchExpected.ts';

const RECALL_FLOOR = 0.7;

export async function runEval(options: { base: string; heuristic?: boolean; repoRoot?: string }): Promise<{ pass: boolean }> {
  const repoRoot = options.repoRoot ?? findRepoRoot();
  const expected = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../fixtures/expected-issues.json', import.meta.url)), 'utf8'),
  ) as ExpectedIssue[];
  const routes = [...new Set(expected.map((issue) => normalizeRoute(issue.route)))];
  const findings = [];
  for (const route of routes) {
    const result = await runAudit({
      url: routeUrl(options.base, route),
      heuristic: options.heuristic,
      repoRoot,
    });
    findings.push(...result.findings);
  }

  const recall = matchExpected(expected, findings);
  const regressionUrl = routeUrl(options.base, '/good-landing');
  const regression = await runAudit({ url: regressionUrl, heuristic: options.heuristic, repoRoot });
  const regressionFindings = regression.findings.filter((finding) => finding.confidence !== 'low');
  const regressionPass = regression.record.gate?.pass === true && regressionFindings.length === 0;
  const pass = recall.recall >= RECALL_FLOOR && regressionPass;
  const summary = {
    generatedAt: new Date().toISOString(),
    pass,
    recall: Number(recall.recall.toFixed(3)),
    matched: recall.matched,
    expected: recall.expected,
    misses: recall.misses,
    unmatchedFindings: recall.unmatchedFindings,
    regression: {
      url: regressionUrl,
      pass: regressionPass,
      gate: regression.record.gate?.pass ?? false,
      findingCount: regressionFindings.length,
      findings: regressionFindings.map((finding) => ({ ruleId: finding.ruleId, selector: finding.selector, title: finding.title })),
    },
  };
  writeFileSync(path.join(repoRoot, 'runs', 'eval-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  const percent = Math.round(recall.recall * 1000) / 10;
  console.log(`Recall: ${recall.matched}/${recall.expected} (${percent}%)`);
  if (recall.misses.length) {
    console.log('Misses:');
    for (const miss of recall.misses) console.log(`- ${miss.route} ${miss.ruleId}: ${miss.description}`);
  }
  console.log(`Unmatched findings: ${recall.unmatchedFindings.length}`);
  for (const extra of recall.unmatchedFindings) console.log(`- ${extra.screen} ${extra.ruleId}: ${extra.title}`);
  console.log(`Regression /good-landing: ${regressionPass ? 'PASS' : 'FAIL'}`);
  if (!regressionPass) {
    for (const finding of regressionFindings) console.log(`- ${finding.ruleId} ${finding.selector}`);
  }
  console.log(`Eval ${pass ? 'PASS' : 'FAIL'} · runs/eval-summary.json`);
  return { pass };
}

function routeUrl(base: string, route: string): string {
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return new URL(route.replace(/^\//, ''), normalized).toString();
}
