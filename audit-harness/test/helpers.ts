import type { Finding, QualityModel, StyleSample } from '../src/types.ts';

export const model: QualityModel = {
  spacing: { step: 4 },
  fonts: { allowedPx: [12, 14, 16, 20, 24, 32] },
  gate: { minScore: 80, maxCritical: 0 },
  allowedHosts: ['localhost', '127.0.0.1', '::1'],
  axe: { tags: ['wcag2a', 'wcag2aa'] },
  viewport: { width: 1280, height: 800 },
  maxFindings: 200,
  ollama: { endpoint: 'http://127.0.0.1:11434/api/chat', model: 'llava', timeoutMs: 50 },
};

export function sample(overrides: Partial<StyleSample> & Pick<StyleSample, 'selector'>): StyleSample {
  return {
    tag: 'div',
    text: 'sample',
    fontSizePx: 16,
    fontSizeExplicit: false,
    auditSpacing: false,
    spacing: [],
    ...overrides,
  };
}

export function makeFinding(overrides: Partial<Finding> & Pick<Finding, 'ruleId' | 'selector' | 'severity'>): Finding {
  return {
    id: '',
    screen: '/demo',
    category: 'accessibility',
    confidence: 'high',
    title: overrides.ruleId,
    description: '',
    evidence: {},
    recommendedAction: 'Fix it',
    verificationStatus: 'open',
    source: 'axe',
    ...overrides,
  };
}
