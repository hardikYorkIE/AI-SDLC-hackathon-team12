import type { DomSummary, Finding } from '../types.ts';

export function lintHeuristics(summary: DomSummary, screen: string): Finding[] {
  const findings: Finding[] = [];
  const h1s = summary.headings.filter((heading) => heading.level === 1);
  if (h1s.length > 1) {
    findings.push({
      id: '',
      screen,
      category: 'visual-hierarchy',
      ruleId: 'multiple-h1',
      severity: 'moderate',
      confidence: 'medium',
      title: 'Multiple h1 headings compete',
      description: `Found ${h1s.length} h1 elements: ${h1s.map((heading) => heading.text || heading.selector).join('; ')}.`,
      selector: h1s.map((heading) => heading.selector).join(', '),
      evidence: { snippet: h1s.map((heading) => heading.text).join(' | ') },
      recommendedAction: 'Keep a single h1 and demote the others to h2.',
      verificationStatus: 'open',
      source: 'heuristic',
    });
  }

  let previous = 0;
  for (const heading of summary.headings) {
    if (previous > 0 && heading.level > previous + 1) {
      findings.push({
        id: '',
        screen,
        category: 'visual-hierarchy',
        ruleId: 'heading-skip',
        severity: 'moderate',
        confidence: 'medium',
        title: 'Heading level skips a rank',
        description: `${heading.selector} is an h${heading.level} immediately after an h${previous}.`,
        selector: heading.selector,
        evidence: { snippet: heading.text },
        recommendedAction: 'Adjust heading levels so they increase by one.',
        verificationStatus: 'open',
        source: 'heuristic',
      });
    }
    previous = heading.level;
  }

  if (summary.primaryButtons.length > 1) {
    findings.push({
      id: '',
      screen,
      category: 'usability',
      ruleId: 'multiple-primary-buttons',
      severity: 'minor',
      confidence: 'medium',
      title: 'More than one primary button',
      description: `Found ${summary.primaryButtons.length} primary buttons: ${summary.primaryButtons.map((button) => button.text || button.selector).join('; ')}.`,
      selector: summary.primaryButtons.map((button) => button.selector).join(', '),
      evidence: { snippet: summary.primaryButtons.map((button) => button.text).join(' | ') },
      recommendedAction: 'Keep one primary action and make the others secondary.',
      verificationStatus: 'open',
      source: 'heuristic',
    });
  }

  return findings;
}
