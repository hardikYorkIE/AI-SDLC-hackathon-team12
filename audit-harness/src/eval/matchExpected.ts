export interface ExpectedIssue {
  route: string;
  ruleId: string;
  description: string;
}

export interface MatchableFinding {
  screen: string;
  ruleId: string;
  title: string;
}

export interface RecallReport {
  expected: number;
  matched: number;
  recall: number;
  misses: ExpectedIssue[];
  unmatchedFindings: MatchableFinding[];
}

export function matchExpected(expected: ExpectedIssue[], findings: MatchableFinding[]): RecallReport {
  const pool = findings.map((finding) => ({ ...finding, route: normalize(finding.screen) }));
  const used = new Set<number>();
  const misses: ExpectedIssue[] = [];
  let matched = 0;
  for (const issue of expected) {
    const route = normalize(issue.route);
    const index = pool.findIndex((finding, i) => !used.has(i) && finding.route === route && finding.ruleId === issue.ruleId);
    if (index === -1) misses.push(issue);
    else {
      used.add(index);
      matched += 1;
    }
  }
  return {
    expected: expected.length,
    matched,
    recall: expected.length === 0 ? 1 : matched / expected.length,
    misses,
    unmatchedFindings: pool.filter((_, index) => !used.has(index)).map(({ route: _route, ...finding }) => finding),
  };
}

function normalize(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname || '/';
}
