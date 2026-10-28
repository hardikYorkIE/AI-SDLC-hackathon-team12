import { readFileSync } from 'node:fs';
import type { QualityModel } from '../types.ts';

const DEFAULT_OLLAMA = {
  endpoint: 'http://127.0.0.1:11434/api/chat',
  model: 'llava',
  timeoutMs: 120_000,
};

export function loadQualityModel(filePath: string): QualityModel {
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<QualityModel>;
  const step = raw.spacing?.step;
  if (typeof step !== 'number' || step <= 0) {
    throw new Error('quality model spacing.step must be a positive number');
  }
  const allowedPx = raw.fonts?.allowedPx;
  if (!Array.isArray(allowedPx) || allowedPx.length === 0 || allowedPx.some((n) => typeof n !== 'number')) {
    throw new Error('quality model fonts.allowedPx must be a non-empty number list');
  }
  const minScore = raw.gate?.minScore;
  const maxCritical = raw.gate?.maxCritical;
  if (typeof minScore !== 'number' || typeof maxCritical !== 'number') {
    throw new Error('quality model gate.minScore and gate.maxCritical are required');
  }
  if (!Array.isArray(raw.allowedHosts) || raw.allowedHosts.length === 0) {
    throw new Error('quality model allowedHosts must list at least one host');
  }
  if (!Array.isArray(raw.axe?.tags) || raw.axe.tags.length === 0) {
    throw new Error('quality model axe.tags must list at least one tag');
  }
  const width = raw.viewport?.width ?? 1280;
  const height = raw.viewport?.height ?? 800;
  return {
    spacing: { step },
    fonts: { allowedPx },
    gate: { minScore, maxCritical },
    allowedHosts: raw.allowedHosts,
    axe: { tags: raw.axe.tags },
    viewport: { width, height },
    maxFindings: raw.maxFindings ?? 200,
    ollama: {
      endpoint: raw.ollama?.endpoint ?? DEFAULT_OLLAMA.endpoint,
      model: raw.ollama?.model ?? DEFAULT_OLLAMA.model,
      timeoutMs: raw.ollama?.timeoutMs ?? DEFAULT_OLLAMA.timeoutMs,
    },
  };
}
