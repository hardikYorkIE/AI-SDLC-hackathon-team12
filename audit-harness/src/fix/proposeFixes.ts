import type { Finding, ProposedFix } from '../types.ts';

export function proposeFixes(findings: Finding[]): ProposedFix[] {
  return findings.map((finding) => {
    if ((finding.ruleId === 'font-scale' || finding.ruleId === 'spacing-grid') && finding.details?.length) {
      const declarations = finding.details
        .map((detail) => `${toCssProperty(detail.property)}: ${detail.suggestedPx}px;`)
        .join(' ');
      return {
        findingId: finding.id,
        type: 'css',
        patch: `${finding.selector} { ${declarations} }`,
        applyMode: 'inject',
        requiresHumanApproval: true,
      };
    }
    return {
      findingId: finding.id,
      type: 'manual',
      patch: finding.recommendedAction,
      applyMode: 'manual',
      requiresHumanApproval: true,
    };
  });
}

function toCssProperty(property: string): string {
  if (property === 'fontSize') return 'font-size';
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
