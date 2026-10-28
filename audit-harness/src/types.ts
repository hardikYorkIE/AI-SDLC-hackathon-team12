export type Severity = 'critical' | 'serious' | 'moderate' | 'minor';
export type Confidence = 'high' | 'medium' | 'low';
export type Category = 'accessibility' | 'consistency' | 'visual-hierarchy' | 'usability' | 'forms';
export type FindingSource = 'axe' | 'spacing' | 'font' | 'heuristic' | 'ollama';

export interface FindingEvidence {
  screenshot?: string;
  snippet?: string;
  helpUrl?: string;
}

export interface Measurement {
  property: string;
  px: number;
  suggestedPx: number;
}

export interface Finding {
  id: string;
  screen: string;
  category: Category;
  ruleId: string;
  severity: Severity;
  confidence: Confidence;
  title: string;
  description: string;
  selector: string;
  evidence: FindingEvidence;
  recommendedAction: string;
  verificationStatus: 'open' | 'resolved';
  source: FindingSource;
  details?: Measurement[];
}

export interface Summary {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  score: number;
}

export interface GateThreshold {
  minScore: number;
  maxCritical: number;
}

export interface GateDecision {
  pass: boolean;
  threshold: GateThreshold;
  actual: Summary;
  blockedBy: string[];
}

export interface ProposedFix {
  findingId: string;
  type: 'css' | 'manual';
  patch: string;
  applyMode: 'inject' | 'manual';
  requiresHumanApproval: true;
}

export interface FixAttribute {
  selector: string;
  name: string;
  value: string;
}

export interface FixInsert {
  position: 'before' | 'after';
  selector: string;
  tag: string;
  text: string;
  attrs?: Record<string, string>;
}

export interface FixRetag {
  selector: string;
  tag: string;
}

export interface FixManifest {
  css?: string;
  attributes?: FixAttribute[];
  inserts?: FixInsert[];
  retags?: FixRetag[];
}

export interface VerificationResult {
  findingId: string;
  reauditRunId: string;
  status: 'resolved' | 'open';
  evidence: {
    before?: string;
    after?: string;
    pixelDiffPercent: number | null;
  };
}

export interface VerificationFile {
  beforeRunId: string;
  reauditRunId: string;
  pixelDiffPercent: number | null;
  results: VerificationResult[];
}

export interface QualityModel {
  spacing: { step: number };
  fonts: { allowedPx: number[] };
  gate: GateThreshold;
  allowedHosts: string[];
  axe: { tags: string[] };
  viewport: { width: number; height: number };
  maxFindings: number;
  ollama: { endpoint: string; model: string; timeoutMs: number };
}

export interface SpacingMeasurement {
  property: string;
  px: number;
}

export interface StyleSample {
  selector: string;
  tag: string;
  text: string;
  fontSizePx: number | null;
  fontSizeExplicit: boolean;
  auditSpacing: boolean;
  spacing: SpacingMeasurement[];
}

export interface HeadingSnapshot {
  level: number;
  text: string;
  selector: string;
}

export interface ButtonSnapshot {
  selector: string;
  text: string;
}

export interface DomSummary {
  title: string;
  headings: HeadingSnapshot[];
  primaryButtons: ButtonSnapshot[];
  samples: StyleSample[];
}

export interface AuditRunRecord {
  id: string;
  target: { url: string; viewport: { width: number; height: number } };
  startedAt: string;
  finishedAt?: string;
  tracks: string[];
  trackNotes?: Record<string, string>;
  artifactDir: string;
  summary: Summary;
  gate?: GateDecision & { runId: string };
}

export interface ReportFile {
  run: AuditRunRecord;
  findings: Finding[];
  proposedFixes: ProposedFix[];
  verification?: VerificationFile;
}
