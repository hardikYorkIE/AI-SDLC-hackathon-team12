#!/usr/bin/env node
/**
 * UI/UX before-audit harness driven by audit_skill_file.md
 * Usage: npm run audit -- --url=http://127.0.0.1:8765
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
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

async function main() {
  const { url, outDir } = parseArgs(process.argv.slice(2));
  const absOut = path.resolve(outDir);
  await mkdir(absOut, { recursive: true });

  const skillPath = path.join(ROOT, "audit_skill_file.md");
  const skillMarkdown = await readFile(skillPath, "utf8");

  console.log(`\n🔎 Before-audit with audit_skill_file.md`);
  console.log(`   URL: ${url}`);
  console.log(`   Viewports: mobile(<768) / tablet(768-1024) / desktop(>1024)`);

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
        phase: "before",
      });
      perViewport.push(result);
      console.log(`${result.issues.length} issues`);
    }
  } catch (err) {
    await browser.close();
    console.error(`\n❌ Could not open ${url}`);
    console.error("   Start the fixture first:  npm run serve");
    console.error("   Then audit:               npm run audit -- --url=http://127.0.0.1:8765\n");
    console.error(String(err.message || err));
    process.exit(1);
  }
  await browser.close();

  const desktop = perViewport.find((v) => v.viewport.name === "desktop") || perViewport.at(-1);
  await writeFile(path.join(absOut, "before.png"), await readFile(path.join(absOut, desktop.screenshot)));

  const deduped = dedupeIssues(perViewport.flatMap((v) => v.issues));
  const issues = stripInternalFields(deduped);
  const score = scoreIssues(deduped);

  const report = {
    quality_model: {
      source: "audit_skill_file.md",
      phase: "before",
      version_note: "Deterministic checks implement §1 tokens + computable §2 heuristics; axe-core covers WCAG AA.",
      breakpoints: QUALITY_MODEL.breakpoints,
      spacing_base_px: QUALITY_MODEL.spacingBasePx,
      touch_targets: QUALITY_MODEL.touchTargets,
      brand: QUALITY_MODEL.brand,
      skill_bytes: skillMarkdown.length,
    },
    url,
    timestamp: new Date().toISOString(),
    score,
    threshold: 90,
    pass: score >= 90,
    viewports: perViewport.map((v) => ({
      name: v.viewport.name,
      width: v.viewport.width,
      screenshot: v.screenshot,
      issue_count: v.issues.length,
      axe: v.axe,
    })),
    issues,
    artifacts: {
      before: "before.png",
      report: "audit-report.json",
      skill_issues: "issues.json",
    },
  };

  await writeFile(path.join(absOut, "audit-report.json"), JSON.stringify(report, null, 2));
  await writeFile(path.join(absOut, "issues.json"), JSON.stringify({ issues }, null, 2));

  console.log(`\n📊 Before score: ${score}/100 ${report.pass ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`   total issues:   ${issues.length}`);
  console.log(`   skill JSON:     ${path.join(absOut, "issues.json")}`);
  console.log(`   full report:    ${path.join(absOut, "audit-report.json")}`);
  console.log(`\nNext: npm run remediate && npm run audit-after -- --url=${url}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
