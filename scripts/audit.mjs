#!/usr/bin/env node
/**
 * Before-audit harness — audit_skill_file.md skill schema
 * Usage:
 *   npm run audit -- --url=<TARGET_URL>
 *   npm run audit -- --url=<APP_URL> --login-url=<LOGIN> --user=... --password=...
 *   npm run audit -- --url=<APP_URL> --auth=./auth.config.json
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  QUALITY_MODEL,
  scoreIssues,
  viewportProfile,
  buildSkillPayload,
} from "./lib/quality-model.mjs";
import { VIEWPORTS, parseArgs, dedupeIssues, auditViewport } from "./lib/ingest.mjs";
import {
  parseAuthCliFlags,
  resolveAuth,
  ensureAuthStorage,
  authLogSummary,
} from "./lib/auth.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function main() {
  const argv = process.argv.slice(2);
  const { url, outDir } = parseArgs(argv);
  const authCli = parseAuthCliFlags(argv, { targetUrl: url });
  const auth = await resolveAuth(authCli, { rootDir: ROOT });
  const absOut = path.resolve(outDir);
  await mkdir(absOut, { recursive: true });

  const skillPath = path.join(ROOT, "audit_skill_file.md");
  const skillMarkdown = await readFile(skillPath, "utf8");

  console.log(`\n🔎 Before-audit with audit_skill_file.md`);
  console.log(`   URL: ${url}`);
  console.log(`   Auth: ${authLogSummary(auth)}`);
  console.log(`   Viewports: mobile / tablet / desktop`);

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
        phase: "before",
        storageState,
      });
      perViewport.push(result);
      console.log(`${result.issues.length} issues`);
    }
  } catch (err) {
    await browser.close();
    console.error(`\n❌ Could not open ${url}`);
    console.error("   Example: npm run audit -- --url=http://127.0.0.1:8765");
    console.error(
      "   Auth:    npm run audit -- --url=<APP> --login-url=<LOGIN> --user=... --password=...\n"
    );
    console.error(String(err.message || err));
    process.exit(1);
  }
  await browser.close();

  const desktop = perViewport.find((v) => v.viewport.name === "desktop") || perViewport.at(-1);
  await writeFile(path.join(absOut, "before.png"), await readFile(path.join(absOut, desktop.screenshot)));

  const deduped = dedupeIssues(perViewport.flatMap((v) => v.issues));
  const skillPayload = buildSkillPayload(deduped);
  const score = scoreIssues(deduped);
  const health = skillPayload.executiveSummary.overallHealth;

  const report = {
    quality_model: {
      source: "audit_skill_file.md",
      phase: "before",
      skill_bytes: skillMarkdown.length,
      spacing_base_px: QUALITY_MODEL.spacingBasePx,
      touch_targets: QUALITY_MODEL.touchTargets,
    },
    url,
    authenticated: Boolean(auth.enabled),
    timestamp: new Date().toISOString(),
    score,
    threshold: 90,
    pass: score >= 90,
    executiveSummary: skillPayload.executiveSummary,
    availableCategories: skillPayload.availableCategories,
    viewports: perViewport.map((v) => ({
      name: v.viewport.name,
      width: v.viewport.width,
      screenshot: v.screenshot,
      issue_count: v.issues.length,
      axe: v.axe,
    })),
    issues: skillPayload.issues,
    // Keep raw (with css_patch) for remediate
    _rawIssues: deduped,
    artifacts: {
      before: "before.png",
      report: "audit-report.json",
      skill_issues: "issues.json",
    },
  };

  await writeFile(path.join(absOut, "audit-report.json"), JSON.stringify(report, null, 2));
  await writeFile(path.join(absOut, "issues.json"), JSON.stringify(skillPayload, null, 2));
  await writeFile(path.join(absOut, "issues.raw.json"), JSON.stringify({ issues: deduped }, null, 2));

  console.log(`\n📊 Before score: ${score}/100 ${report.pass ? "✅ PASS" : "❌ FAIL"} · Health: ${health}`);
  console.log(`   critical fires: ${skillPayload.executiveSummary.criticalFires}`);
  console.log(`   total issues:   ${skillPayload.issues.length}`);
  console.log(`   categories:     ${skillPayload.availableCategories.join(", ") || "—"}`);
  console.log(`   skill JSON:     ${path.join(absOut, "issues.json")}`);
  console.log(`\nNext: npm run remediate && npm run audit-after -- --url=${url}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
