#!/usr/bin/env node
/**
 * Runs before audit → remediate → after audit with the same CLI args.
 * Usage:
 *   npm run audit:full -- --url=http://127.0.0.1:8765
 *   npm run audit:full -- --url=<APP> --login-url=<LOGIN> --user=... --password=...
 */
import { spawn } from "node:child_process";

function run(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`))));
  });
}

const args = process.argv.slice(2);

await run("scripts/audit.mjs", args);
await run("scripts/remediate.mjs", []);
await run("scripts/audit-after.mjs", args);
console.log("\n✅ audit:full complete. Next: npm run report\n");
