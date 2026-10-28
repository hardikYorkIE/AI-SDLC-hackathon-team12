import type { Finding, QualityModel, StyleSample } from '../types.ts';

export function nearestAllowed(value: number, allowed: number[]): number {
  return allowed.reduce((best, candidate) => {
    const bestDistance = Math.abs(best - value);
    const nextDistance = Math.abs(candidate - value);
    if (nextDistance < bestDistance) return candidate;
    if (nextDistance === bestDistance && candidate > best) return candidate;
    return best;
  });
}

export function lintFonts(samples: StyleSample[], model: QualityModel, screen: string): Finding[] {
  const allowed = new Set(model.fonts.allowedPx);
  const findings: Finding[] = [];
  for (const sample of samples) {
    if (!sample.fontSizeExplicit || sample.fontSizePx === null) continue;
    if (allowed.has(sample.fontSizePx)) continue;
    const suggestedPx = nearestAllowed(sample.fontSizePx, model.fonts.allowedPx);
    findings.push({
      id: '',
      screen,
      category: 'consistency',
      ruleId: 'font-scale',
      severity: 'serious',
      confidence: 'high',
      title: 'Font size is off the type scale',
      description: `${sample.selector} computes to ${sample.fontSizePx}px, which is outside ${model.fonts.allowedPx.join('/')}.`,
      selector: sample.selector,
      evidence: { snippet: sample.text },
      recommendedAction: `Set font-size to ${suggestedPx}px.`,
      verificationStatus: 'open',
      source: 'font',
      details: [{ property: 'fontSize', px: sample.fontSizePx, suggestedPx }],
    });
  }
  return findings;
}
