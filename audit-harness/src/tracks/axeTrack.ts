import type { Page } from 'playwright';
import type { Finding, QualityModel, Severity } from '../types.ts';

const AXE_ACTIONS: Record<string, string> = {
  'color-contrast': 'Increase text and background contrast to at least 4.5:1 for normal text.',
  label: 'Give the control a visible label associated with for/id, or an accessible name.',
  'button-name': 'Give the button visible text or an aria-label that describes its action.',
};

export async function runAxe(page: Page, model: QualityModel, screen: string): Promise<Finding[]> {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const results = await withTimeout(
    new AxeBuilder({ page }).withTags(model.axe.tags).analyze(),
    60_000,
    'axe timed out after 60s',
  );
  return results.violations.flatMap((violation) => violationToFindings(violation, screen));
}

function violationToFindings(
  violation: {
    id: string;
    impact?: string | null;
    help: string;
    description: string;
    helpUrl: string;
    nodes: Array<{ target: Array<string | string[]>; html: string; failureSummary?: string }>;
  },
  screen: string,
): Finding[] {
  const nodes = violation.nodes.length > 0 ? violation.nodes : [{ target: ['unknown'], html: '', failureSummary: '' }];
  return nodes.map((node) => ({
    id: '',
    screen,
    category: 'accessibility',
    ruleId: violation.id,
    severity: normalizeImpact(violation.impact),
    confidence: 'high',
    title: violation.help,
    description: [violation.description, node.failureSummary].filter(Boolean).join(' ').slice(0, 500),
    selector: node.target.flat().join(' '),
    evidence: {
      screenshot: 'artifacts/viewport.png',
      snippet: node.html.slice(0, 300),
      helpUrl: violation.helpUrl,
    },
    recommendedAction: AXE_ACTIONS[violation.id] ?? `See ${violation.helpUrl}`,
    verificationStatus: 'open',
    source: 'axe',
  }));
}

function normalizeImpact(impact?: string | null): Severity {
  if (impact === 'critical' || impact === 'serious' || impact === 'moderate' || impact === 'minor') return impact;
  return 'moderate';
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
