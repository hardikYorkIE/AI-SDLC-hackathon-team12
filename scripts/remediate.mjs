#!/usr/bin/env node
/**
 * Build CSS patches from audit_skill_file.md issues JSON.
 * Usage: npm run remediate
 */
import { readFile, writeFile, access, mkdir } from "node:fs/promises";
import path from "node:path";
import { buildPatchFromIssues } from "./lib/patch-builder.mjs";

const outDir = path.resolve("artifacts/latest");
const issuesPath = path.join(outDir, "issues.json");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(issuesPath))) {
    console.error("\n❌ No issues.json found. Run before-audit first:\n");
    console.error("   npm run audit -- --url=http://127.0.0.1:8765\n");
    process.exit(1);
  }

  const payload = JSON.parse(await readFile(issuesPath, "utf8"));
  const issues = payload.issues || payload;
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
        source: "artifacts/latest/issues.json",
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

  console.log(`\n🩹 Remediation CSS built from audit_skill_file.md patches`);
  console.log(`   rules applied: ${applied.length} (cap ${maxRules})`);
  console.log(`   filtered/skip: ${Math.max(0, skipped)}`);
  console.log(`   css:           ${cssPath}`);
  console.log(`   meta:          ${metaPath}`);
  console.log(`\nNext: npm run audit-after -- --url=http://127.0.0.1:8765\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
