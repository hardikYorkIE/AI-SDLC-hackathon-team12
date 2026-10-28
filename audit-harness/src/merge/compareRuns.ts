import type { Finding, VerificationFile } from '../types.ts';
import { findingKey } from './findingsMerger.ts';

export function compareRuns(
  before: Finding[],
  after: Finding[],
  meta: {
    beforeRunId: string;
    reauditRunId: string;
    beforeShot?: string;
    afterShot?: string;
    pixelDiffPercent: number | null;
  },
): VerificationFile {
  const afterKeys = new Set(after.map((finding) => findingKey(finding)));
  return {
    beforeRunId: meta.beforeRunId,
    reauditRunId: meta.reauditRunId,
    pixelDiffPercent: meta.pixelDiffPercent,
    results: before.map((finding) => ({
      findingId: finding.id,
      reauditRunId: meta.reauditRunId,
      status: afterKeys.has(findingKey(finding)) ? 'open' : 'resolved',
      evidence: {
        before: meta.beforeShot,
        after: meta.afterShot,
        pixelDiffPercent: meta.pixelDiffPercent,
      },
    })),
  };
}
