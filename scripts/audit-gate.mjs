#!/usr/bin/env node
/**
 * Bonus CI gate: fail if audit score is below threshold.
 * Usage: npm run audit-gate -- --url=http://127.0.0.1:8765 --threshold=90
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const out = { url: "http://127.0.0.1:8765/", threshold: 90 };
  for (const arg of argv) {
    if (arg.startsWith("--url=")) out.url = arg.slice(6);
    else if (arg.startsWith("--threshold=")) out.threshold = Number(arg.slice(12));
  }
  return out;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const { url, threshold } = parseArgs(argv);
  // Forward auth + url flags (drop --threshold which audit.mjs ignores harmlessly if present)
  const forward = argv.filter((a) => !a.startsWith("--threshold="));
  if (!forward.some((a) => a.startsWith("--url="))) forward.unshift(`--url=${url}`);
  await run("node", ["scripts/audit.mjs", ...forward]);

  const report = JSON.parse(await readFile(path.resolve("artifacts/latest/audit-report.json"), "utf8"));
  console.log(`\n🚧 Gate threshold: ${threshold}`);
  console.log(`   Actual score:    ${report.score}`);

  if (report.score < threshold) {
    console.error(`\n❌ audit-gate FAILED (${report.score} < ${threshold})\n`);
    process.exit(1);
  }

  console.log(`\n✅ audit-gate PASSED\n`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
