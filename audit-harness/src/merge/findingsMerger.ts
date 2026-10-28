import type { Confidence, Finding, Severity } from '../types.ts';

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  serious: 3,
  moderate: 2,
  minor: 1,
};

const CONFIDENCE_RANK: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export function finalizeFindings(findings: Finding[], maxFindings: number): Finding[] {
  const best = new Map<string, Finding>();
  for (const finding of findings) {
    const key = findingKey(finding);
    const current = best.get(key);
    if (!current || prefer(finding, current)) best.set(key, finding);
  }
  const merged = [...best.values()].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (bySeverity !== 0) return bySeverity;
    const byRule = a.ruleId.localeCompare(b.ruleId);
    if (byRule !== 0) return byRule;
    return a.selector.localeCompare(b.selector);
  });
  return merged.slice(0, Math.max(0, maxFindings)).map((finding, index) => ({
    ...finding,
    id: `find_${String(index + 1).padStart(3, '0')}`,
    verificationStatus: 'open',
  }));
}

export function findingKey(finding: Pick<Finding, 'ruleId' | 'selector'>): string {
  return `${finding.ruleId}@@${finding.selector}`;
}

function prefer(next: Finding, current: Finding): boolean {
  if (SEVERITY_RANK[next.severity] !== SEVERITY_RANK[current.severity]) {
    return SEVERITY_RANK[next.severity] > SEVERITY_RANK[current.severity];
  }
  return CONFIDENCE_RANK[next.confidence] > CONFIDENCE_RANK[current.confidence];
}
