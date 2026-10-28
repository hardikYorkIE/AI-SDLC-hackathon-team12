import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { loadQualityModel } from '../config/loadQualityModel.ts';
import { diffPng } from '../diff/pixelDiff.ts';
import { applyFixManifest, loadFixManifest } from '../fix/injectCss.ts';
import { proposeFixes } from '../fix/proposeFixes.ts';
import { evaluateGate } from '../gate/evaluateGate.ts';
import { summarizeFindings } from '../gate/summarize.ts';
import { capturePage, settlePage } from '../ingestion/capture.ts';
import { assertAllowedUrl, normalizeRoute } from '../ingestion/urlPolicy.ts';
import { compareRuns } from '../merge/compareRuns.ts';
import { finalizeFindings } from '../merge/findingsMerger.ts';
import { renderHtml } from '../report/renderHtml.ts';
import { runAxe } from '../tracks/axeTrack.ts';
import { lintFonts } from '../tracks/fontLinter.ts';
import { lintHeuristics } from '../tracks/heuristicTrack.ts';
import { runOllamaTrack } from '../tracks/ollamaTrack.ts';
import { lintSpacing } from '../tracks/spacingLinter.ts';
import type { AuditRunRecord, Finding, QualityModel, ReportFile, Summary } from '../types.ts';
import { createUniqueRunId, findRepoRoot } from './runId.ts';

const EMPTY_SUMMARY: Summary = { critical: 0, serious: 0, moderate: 0, minor: 0, score: 100 };

export interface RunAuditOptions {
  url: string;
  mode?: 'capture' | 'audit';
  fixPath?: string;
  beforeRunId?: string;
  heuristic?: boolean;
  ollama?: boolean;
  repoRoot?: string;
  qualityModelPath?: string;
}

export interface RunAuditResult {
  record: AuditRunRecord;
  findings: Finding[];
  reportPath: string;
}

export async function runAudit(options: RunAuditOptions): Promise<RunAuditResult> {
  const repoRoot = options.repoRoot ?? findRepoRoot();
  const model = loadQualityModel(options.qualityModelPath ?? defaultModelPath());
  const target = assertAllowedUrl(options.url, model.allowedHosts);
  const runsDir = path.join(repoRoot, 'runs');
  const beforeRunId = options.beforeRunId ? assertRunId(options.beforeRunId) : undefined;
  if (beforeRunId && !existsSync(path.join(runsDir, beforeRunId, 'report.json'))) {
    throw new Error(`Before run not found: ${beforeRunId}`);
  }
  const fixPath = options.fixPath ? resolveExisting(options.fixPath, repoRoot) : undefined;
  const id = createUniqueRunId(runsDir);
  const runDir = path.join(runsDir, id);
  const artifactsDir = path.join(runDir, 'artifacts');
  await mkdir(artifactsDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const mode = options.mode ?? 'audit';
  const tracks = mode === 'capture' ? ['ingestion'] : ['deterministic'];
  if (mode === 'audit' && options.heuristic !== false) tracks.push('heuristic');
  if (mode === 'audit' && options.ollama) tracks.push('ollama');
  const trackNotes: Record<string, string> = {};

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: model.viewport,
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(30_000);
    await page.goto(target.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    try {
      await page.locator('[data-ready="true"]').waitFor({ state: 'visible', timeout: 15_000 });
    } catch {
      throw new Error(`Timed out waiting for [data-ready="true"] at ${target}`);
    }
    await page.addStyleTag({
      content: '*,*::before,*::after{animation:none !important;transition:none !important;caret-color:transparent !important;}',
    });
    if (fixPath) await applyFixManifest(page, loadFixManifest(fixPath));
    await settlePage(page);
    const summary = await capturePage(page, artifactsDir);
    const screen = normalizeRoute(target.pathname);

    if (mode === 'capture') {
      const record = buildRecord({ id, target: target.toString(), model, startedAt, tracks, trackNotes, summary: EMPTY_SUMMARY });
      writeJson(path.join(runDir, 'run.json'), record);
      writeFileSync(path.join(runsDir, 'latest.txt'), `${id}\n`);
      return { record, findings: [], reportPath: `runs/${id}/artifacts/viewport.png` };
    }

    const [axe, spacing, fonts, heuristics, ollama] = await Promise.all([
      runAxe(page, model, screen).then(
        (findings) => ({ findings, error: undefined as string | undefined }),
        (error: unknown) => ({ findings: [] as Finding[], error: messageOf(error) }),
      ),
      Promise.resolve(lintSpacing(summary.samples, model, screen)),
      Promise.resolve(lintFonts(summary.samples, model, screen)),
      Promise.resolve(options.heuristic === false ? [] : lintHeuristics(summary, screen)),
      options.ollama ? runOllama(summary, screen, model, path.join(artifactsDir, 'viewport.png')) : Promise.resolve(undefined),
    ]);
    if (axe.error) trackNotes.axe = axe.error;
    if (ollama?.skipped) trackNotes.ollama = ollama.reason ?? 'skipped';

    const findings = finalizeFindings(
      [...axe.findings, ...spacing, ...fonts, ...heuristics, ...(ollama?.findings ?? [])],
      model.maxFindings,
    ).map((finding) => ({
      ...finding,
      evidence: { ...finding.evidence, screenshot: finding.evidence.screenshot ?? 'artifacts/viewport.png' },
    }));
    const counts = summarizeFindings(findings);
    const decision = evaluateGate(counts, model.gate, findings, { incomplete: Boolean(axe.error) });
    const gate = { runId: id, ...decision };
    const proposedFixes = proposeFixes(findings);
    const verification = beforeRunId
      ? compareRuns(readFindings(path.join(runsDir, beforeRunId, 'report.json')), findings, {
          beforeRunId,
          reauditRunId: id,
          beforeShot: `../${beforeRunId}/artifacts/viewport.png`,
          afterShot: 'artifacts/viewport.png',
          pixelDiffPercent: diffAgainstBefore(runsDir, beforeRunId, artifactsDir, trackNotes),
        })
      : undefined;

    const record = buildRecord({
      id,
      target: target.toString(),
      model,
      startedAt,
      tracks,
      trackNotes,
      summary: counts,
      gate,
    });
    const report: ReportFile = { run: record, findings, proposedFixes, verification };
    writeJson(path.join(runDir, 'run.json'), record);
    writeJson(path.join(runDir, 'report.json'), report);
    writeJson(path.join(runDir, 'gate-decision.json'), gate);
    writeJson(path.join(runDir, 'proposed-fixes.json'), proposedFixes);
    if (verification) writeJson(path.join(runDir, 'verification.json'), verification);
    writeFileSync(path.join(runDir, 'report.html'), renderHtml(report));
    writeFileSync(path.join(runsDir, 'latest.txt'), `${id}\n`);
    return { record, findings, reportPath: `runs/${id}/report.html` };
  } finally {
    await browser?.close();
  }
}

async function runOllama(
  summary: { title: string; headings: { level: number; text: string; selector: string }[]; primaryButtons: { selector: string; text: string }[] },
  screen: string,
  model: QualityModel,
  viewportPath: string,
) {
  let imageBase64: string | undefined;
  try {
    imageBase64 = (await readFile(viewportPath)).toString('base64');
  } catch {
    imageBase64 = undefined;
  }
  return runOllamaTrack({
    screen,
    summary,
    model: model.ollama.model,
    endpoint: model.ollama.endpoint,
    timeoutMs: model.ollama.timeoutMs,
    retries: 1,
    imageBase64,
  });
}

function diffAgainstBefore(runsDir: string, beforeRunId: string, artifactsDir: string, trackNotes: Record<string, string>): number | null {
  const beforePng = path.join(runsDir, beforeRunId, 'artifacts', 'viewport.png');
  const afterPng = path.join(artifactsDir, 'viewport.png');
  if (!existsSync(beforePng) || !existsSync(afterPng)) {
    trackNotes.diff = 'screenshot missing';
    return null;
  }
  const diff = diffPng(beforePng, afterPng, path.join(artifactsDir, 'diff.png'));
  if (diff.percent === null) trackNotes.diff = diff.reason;
  return diff.percent;
}

function readFindings(reportPath: string): Finding[] {
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as ReportFile;
  return report.findings ?? [];
}

function buildRecord(input: {
  id: string;
  target: string;
  model: QualityModel;
  startedAt: string;
  tracks: string[];
  trackNotes: Record<string, string>;
  summary: Summary;
  gate?: AuditRunRecord['gate'];
}): AuditRunRecord {
  return {
    id: input.id,
    target: { url: input.target, viewport: input.model.viewport },
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    tracks: input.tracks,
    trackNotes: Object.keys(input.trackNotes).length ? input.trackNotes : undefined,
    artifactDir: `runs/${input.id}`,
    summary: input.summary,
    gate: input.gate,
  };
}

function defaultModelPath(): string {
  return fileURLToPath(new URL('../../config/quality-model.json', import.meta.url));
}

function assertRunId(runId: string): string {
  if (!/^run_[\w.:-]+$/.test(runId)) throw new Error('Invalid --before run id');
  return runId;
}

function resolveExisting(filePath: string, repoRoot: string): string {
  if (path.isAbsolute(filePath) && existsSync(filePath)) return filePath;
  const fromCwd = path.resolve(process.cwd(), filePath);
  if (existsSync(fromCwd)) return fromCwd;
  const fromRoot = path.resolve(repoRoot, filePath);
  if (existsSync(fromRoot)) return fromRoot;
  throw new Error(`Fix manifest not found: ${filePath}`);
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
