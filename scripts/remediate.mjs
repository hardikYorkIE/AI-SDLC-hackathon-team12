#!/usr/bin/env node
/**
 * Build CSS patches from skill-format issues (prefer issues.raw.json with css_patch).
 * Usage: npm run remediate
 */
import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import path from "node:path";
import { buildPatchFromIssues } from "./lib/patch-builder.mjs";

const outDir = path.resolve("artifacts/latest");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadIssues() {
  const rawPath = path.join(outDir, "issues.raw.json");
  const skillPath = path.join(outDir, "issues.json");
  const reportPath = path.join(outDir, "audit-report.json");

  if (await exists(rawPath)) {
    return JSON.parse(await readFile(rawPath, "utf8")).issues || [];
  }
  if (await exists(reportPath)) {
    const report = JSON.parse(await readFile(reportPath, "utf8"));
    if (report._rawIssues?.length) return report._rawIssues;
  }
  if (await exists(skillPath)) {
    const skill = JSON.parse(await readFile(skillPath, "utf8"));
    return skill.issues || [];
  }
  return null;
}

async function main() {
  const issues = await loadIssues();
  if (!issues) {
    console.error("\n❌ No issues found. Run before-audit first:\n");
    console.error("   npm run audit -- --url=<TARGET_URL>\n");
    process.exit(1);
  }

  const { css, applied, skipped, maxRules } = buildPatchFromIssues(issues, { maxRules: 80 });
  await mkdir(outDir, { recursive: true });
  const cssPath = path.join(outDir, "patch.css");
  const metaPath = path.join(outDir, "patch-meta.json");

  await writeFile(cssPath, css);
  await writeFile(
    metaPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        quality_model: "audit_skill_file.md",
        max_rules: maxRules,
        applied_count: applied.length,
        skipped_or_filtered: skipped,
        applied,
      },
      null,
      2
    )
  );

  console.log(`\n🩹 Remediation CSS from audit_skill_file.md`);
  console.log(`   rules applied: ${applied.length} (cap ${maxRules})`);
  console.log(`   filtered/skip: ${Math.max(0, skipped)}`);
  console.log(`   css:           ${cssPath}`);
  console.log(`\nNext: npm run audit-after -- --url=<TARGET_URL>\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
