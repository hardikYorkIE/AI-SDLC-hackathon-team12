#!/usr/bin/env node
/**
 * Apply patch.css, re-audit, capture after screenshots.
 * Usage: npm run audit-after -- --url=http://127.0.0.1:8765
 */
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { QUALITY_MODEL, scoreIssues, viewportProfile } from "./lib/quality-model.mjs";
import {
  VIEWPORTS,
  parseArgs,
  stripInternalFields,
  dedupeIssues,
  auditViewport,
} from "./lib/ingest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { url, outDir } = parseArgs(process.argv.slice(2));
  const absOut = path.resolve(outDir);
  const patchPath = path.join(absOut, "patch.css");
  const beforeReportPath = path.join(absOut, "audit-report.json");

  if (!(await exists(patchPath))) {
    console.error("\n❌ No patch.css found. Run remediate first:\n");
    console.error("   npm run remediate\n");
    process.exit(1);
  }

  const patchCss = await readFile(patchPath, "utf8");
  let beforeScore = null;
  let beforeIssueCount = null;
  if (await exists(beforeReportPath)) {
    const before = JSON.parse(await readFile(beforeReportPath, "utf8"));
    beforeScore = before.score ?? null;
    beforeIssueCount = before.issues?.length ?? null;
  }

  console.log(`\n✨ After-audit (patched) with audit_skill_file.md`);
  console.log(`   URL:   ${url}`);
  console.log(`   Patch: ${patchPath}`);

  const browser = await chromium.launch({ headless: true });
  const perViewport = [];
  try {
    for (const vp of VIEWPORTS) {
      process.stdout.write(`   → ${viewportProfile(vp.width).name} ${vp.width}px... `);
      const result = await auditViewport({
        browser,
        url,
        viewport: vp,
        absOut,
        phase: "after",
        patchCss,
      });
      perViewport.push(result);
      console.log(`${result.issues.length} issues`);
    }
  } catch (err) {
    await browser.close();
    console.error(`\n❌ Could not open ${url}`);
    console.error("   Start the fixture first:  npm run serve\n");
    console.error(String(err.message || err));
    process.exit(1);
  }
  await browser.close();

  const desktop = perViewport.find((v) => v.viewport.name === "desktop") || perViewport.at(-1);
  await writeFile(path.join(absOut, "after.png"), await readFile(path.join(absOut, desktop.screenshot)));

  const deduped = dedupeIssues(perViewport.flatMap((v) => v.issues));
  const issues = stripInternalFields(deduped);
  const score = scoreIssues(deduped);

  const afterReport = {
    quality_model: {
      source: "audit_skill_file.md",
      phase: "after",
      patched: true,
    },
    url,
    timestamp: new Date().toISOString(),
    score,
    threshold: 90,
    pass: score >= 90,
    comparison: {
      before_score: beforeScore,
      after_score: score,
      delta: beforeScore == null ? null : score - beforeScore,
      before_issues: beforeIssueCount,
      after_issues: issues.length,
    },
    viewports: perViewport.map((v) => ({
      name: v.viewport.name,
      width: v.viewport.width,
      screenshot: v.screenshot,
      issue_count: v.issues.length,
      axe: v.axe,
    })),
    issues,
    artifacts: {
      after: "after.png",
      patch: "patch.css",
      report: "audit-after-report.json",
      skill_issues: "issues-after.json",
    },
  };

  // Merge comparison into primary audit-report for the visualizer
  if (await exists(beforeReportPath)) {
    const before = JSON.parse(await readFile(beforeReportPath, "utf8"));
    before.after = {
      score,
      pass: afterReport.pass,
      issue_count: issues.length,
      timestamp: afterReport.timestamp,
      viewports: afterReport.viewports,
      comparison: afterReport.comparison,
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

  await writeFile(path.join(absOut, "audit-after-report.json"), JSON.stringify(afterReport, null, 2));
  await writeFile(path.join(absOut, "issues-after.json"), JSON.stringify({ issues }, null, 2));

  const delta =
    beforeScore == null ? "n/a" : `${score - beforeScore >= 0 ? "+" : ""}${score - beforeScore}`;

  console.log(`\n📊 After score: ${score}/100 ${afterReport.pass ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`   before → after: ${beforeScore ?? "?"} → ${score} (${delta})`);
  console.log(`   issues:         ${beforeIssueCount ?? "?"} → ${issues.length}`);
  console.log(`   screenshot:     ${path.join(absOut, "after.png")}`);
  console.log(`\nNext: npm run report\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
