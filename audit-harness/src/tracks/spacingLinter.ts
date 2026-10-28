import type { Finding, QualityModel, StyleSample } from '../types.ts';

export const SPACING_PROPERTIES = [
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'rowGap',
  'columnGap',
] as const;

export function nearestStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function lintSpacing(samples: StyleSample[], model: QualityModel, screen: string): Finding[] {
  const findings: Finding[] = [];
  for (const sample of samples) {
    if (!sample.auditSpacing) continue;
    const details = sample.spacing
      .filter((entry) => entry.px % model.spacing.step !== 0)
      .map((entry) => ({
        property: entry.property,
        px: entry.px,
        suggestedPx: nearestStep(entry.px, model.spacing.step),
      }));
    if (details.length === 0) continue;
    const described = details.map((entry) => `${cssName(entry.property)} ${entry.px}px`).join(', ');
    findings.push({
      id: '',
      screen,
      category: 'consistency',
      ruleId: 'spacing-grid',
      severity: 'serious',
      confidence: 'high',
      title: 'Spacing is off the 4px grid',
      description: `${described} ${details.length === 1 ? 'is' : 'are'} not on a ${model.spacing.step}px step.`,
      selector: sample.selector,
      evidence: { snippet: sample.text },
      recommendedAction: `Snap ${described} to the nearest ${model.spacing.step}px step.`,
      verificationStatus: 'open',
      source: 'spacing',
      details,
    });
  }
  return findings;
}

function cssName(property: string): string {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
