import type { Finding, GateDecision, GateThreshold, Summary } from '../types.ts';

export function evaluateGate(
  summary: Summary,
  threshold: GateThreshold,
  findings: Finding[] = [],
  options?: { incomplete?: boolean },
): GateDecision {
  const blockedBy: string[] = [];
  if (options?.incomplete) blockedBy.push('audit-incomplete');
  if (summary.critical > threshold.maxCritical) {
    const criticals = findings.filter((finding) => finding.severity === 'critical' && finding.confidence !== 'low');
    blockedBy.push(...(criticals.length ? criticals.map((finding) => finding.id || finding.ruleId) : ['critical']));
  }
  if (summary.score < threshold.minScore) blockedBy.push('score');
  return {
    pass: blockedBy.length === 0,
    threshold,
    actual: summary,
    blockedBy,
  };
}
