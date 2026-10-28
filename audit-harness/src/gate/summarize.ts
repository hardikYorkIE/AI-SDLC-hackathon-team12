import type { Finding, Severity, Summary } from '../types.ts';

const WEIGHT: Record<Severity, number> = {
  critical: 10,
  serious: 5,
  moderate: 2,
  minor: 1,
};

export function summarizeFindings(findings: Finding[]): Summary {
  const summary: Summary = { critical: 0, serious: 0, moderate: 0, minor: 0, score: 100 };
  for (const finding of findings) {
    if (finding.confidence === 'low') continue;
    summary[finding.severity] += 1;
  }
  const penalty =
    WEIGHT.critical * summary.critical +
    WEIGHT.serious * summary.serious +
    WEIGHT.moderate * summary.moderate +
    WEIGHT.minor * summary.minor;
  summary.score = Math.max(0, 100 - penalty);
  return summary;
}
