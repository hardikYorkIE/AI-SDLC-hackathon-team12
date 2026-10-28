#!/usr/bin/env node
/**
 * Apply patch.css, re-audit, capture after screenshots (skill schema).
 * Usage: npm run audit-after -- --url=<TARGET_URL> [--login-url=... --user=... --password=...]
 */
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { scoreIssues, viewportProfile, buildSkillPayload } from "./lib/quality-model.mjs";
import { VIEWPORTS, parseArgs, dedupeIssues, auditViewport } from "./lib/ingest.mjs";
import {
  parseAuthCliFlags,
  resolveAuth,
  ensureAuthStorage,
  authLogSummary,
} from "./lib/auth.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const { url, outDir } = parseArgs(argv);
  const authCli = parseAuthCliFlags(argv, { targetUrl: url });
  // Reuse the session just saved by the before-audit. A form run with no
  // credentials (--auth-inline) must not pick up a previous site's cookies.
  const priorState = path.resolve(outDir, "auth-storage.json");
  const inlineWithoutCreds = authCli.authInline && !(authCli.user && authCli.password);
  if (!authCli.noAuth && !authCli.storageState && !inlineWithoutCreds && (await exists(priorState))) {
    authCli.storageState = priorState;
  }
  const auth = await resolveAuth(authCli, { rootDir: ROOT });
  const absOut = path.resolve(outDir);
  const patchPath = path.join(absOut, "patch.css");
  const beforeReportPath = path.join(absOut, "audit-report.json");

  if (!(await exists(patchPath))) {
    console.error("\n❌ No patch.css. Run: npm run remediate\n");
    process.exit(1);
  }

  const patchCss = await readFile(patchPath, "utf8");
  let beforeScore = null;
  let beforeIssueCount = null;
  let beforeHealth = null;
  if (await exists(beforeReportPath)) {
    const before = JSON.parse(await readFile(beforeReportPath, "utf8"));
    beforeScore = before.score ?? null;
    beforeIssueCount = before.issues?.length ?? null;
    beforeHealth = before.executiveSummary?.overallHealth ?? null;
  }

  console.log(`\n✨ After-audit (patched) · audit_skill_file.md`);
  console.log(`   URL:   ${url}`);
  console.log(`   Auth:  ${authLogSummary(auth)}`);

  const browser = await chromium.launch({ headless: true });
  const perViewport = [];
  try {
    const storageState = await ensureAuthStorage(browser, auth, { absOut, targetUrl: url });
    for (const vp of VIEWPORTS) {
      process.stdout.write(`   → ${viewportProfile(vp.width).name} ${vp.width}px... `);
      const result = await auditViewport({
        browser,
        url,
        viewport: vp,
        absOut,
        phase: "after",
        patchCss,
        storageState,
      });
      perViewport.push(result);
      console.log(`${result.issues.length} issues`);
    }
  } catch (err) {
    await browser.close();
    console.error(`\n❌ Could not open ${url}\n`);
    console.error(String(err.message || err));
    process.exit(1);
  }
  await browser.close();

  const desktop = perViewport.find((v) => v.viewport.name === "desktop") || perViewport.at(-1);
  await writeFile(path.join(absOut, "after.png"), await readFile(path.join(absOut, desktop.screenshot)));

  const deduped = dedupeIssues(perViewport.flatMap((v) => v.issues));
  const skillPayload = buildSkillPayload(deduped);
  const score = scoreIssues(deduped);

  const afterReport = {
    quality_model: { source: "audit_skill_file.md", phase: "after", patched: true },
    url,
    timestamp: new Date().toISOString(),
    score,
    threshold: 90,
    pass: score >= 90,
    executiveSummary: skillPayload.executiveSummary,
    availableCategories: skillPayload.availableCategories,
    comparison: {
      // Primary hero metric: issue count (should decrease after remediation)
      before_issues: beforeIssueCount,
      after_issues: skillPayload.issues.length,
      issues_delta: beforeIssueCount == null ? null : skillPayload.issues.length - beforeIssueCount,
      // Secondary: quality score 0–100 (higher is better)
      before_score: beforeScore,
      after_score: score,
      score_delta: beforeScore == null ? null : score - beforeScore,
      before_health: beforeHealth,
      after_health: skillPayload.executiveSummary.overallHealth,
    },
    viewports: perViewport.map((v) => ({
      name: v.viewport.name,
      width: v.viewport.width,
      screenshot: v.screenshot,
      issue_count: v.issues.length,
      axe: v.axe,
    })),
    issues: skillPayload.issues,
    artifacts: {
      after: "after.png",
      patch: "patch.css",
      report: "audit-after-report.json",
      skill_issues: "issues-after.json",
    },
  };

  if (await exists(beforeReportPath)) {
    const before = JSON.parse(await readFile(beforeReportPath, "utf8"));
    before.after = {
      score,
      pass: afterReport.pass,
      issue_count: skillPayload.issues.length,
      timestamp: afterReport.timestamp,
      executiveSummary: skillPayload.executiveSummary,
      availableCategories: skillPayload.availableCategories,
      viewports: afterReport.viewports,
      comparison: afterReport.comparison,
      issues: skillPayload.issues,
    };
    before.artifacts = {
      ...before.artifacts,
      after: "after.png",
      patch: "patch.css",
      after_report: "audit-after-report.json",
      after_issues: "issues-after.json",
    };
    await writeFile(beforeReportPath, JSON.stringify(before, null, 2));
  }

  await mkdir(absOut, { recursive: true });
  await writeFile(path.join(absOut, "audit-after-report.json"), JSON.stringify(afterReport, null, 2));
  await writeFile(path.join(absOut, "issues-after.json"), JSON.stringify(skillPayload, null, 2));

  const issueDelta =
    beforeIssueCount == null ? "n/a" : skillPayload.issues.length - beforeIssueCount;
  console.log(`\n📊 After: ${skillPayload.issues.length} issues (was ${beforeIssueCount ?? "?"}) · Health: ${skillPayload.executiveSummary.overallHealth}`);
  console.log(`   issues before → after: ${beforeIssueCount ?? "?"} → ${skillPayload.issues.length} (${issueDelta <= 0 ? "" : "+"}${issueDelta})`);
  console.log(`   quality score:         ${beforeScore ?? "?"} → ${score} (higher is better; hero metric is issue count)`);
  console.log(`\nNext: npm run report\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
