/**
 * One folder per audit run. artifacts/latest is a symlink to the newest run.
 */
import { access, lstat, mkdir, readFile, readdir, rename, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

function pad(n) {
  return String(n).padStart(2, "0");
}

function safeSegment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** Filesystem-safe run id: 2026-10-28_18-12-43_lawsofux.com */
export function runFolderName(url, date = new Date()) {
  const when = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const stamp = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}_${pad(when.getHours())}-${pad(when.getMinutes())}-${pad(when.getSeconds())}`;
  let host = "page";
  let pathSlug = "";
  try {
    const parsed = new URL(url);
    host = safeSegment(parsed.hostname) || "page";
    pathSlug = safeSegment(
      parsed.pathname.split("/").filter(Boolean).slice(0, 3).join("-")
    );
  } catch {
    host = safeSegment(url) || "page";
  }
  const slug = [host, pathSlug].filter(Boolean).join("_");
  return `${stamp}_${slug || "page"}`;
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function uniqueName(artifactsDir, base) {
  let name = base;
  let n = 2;
  while (await exists(path.join(artifactsDir, name))) {
    name = `${base}-${n++}`;
  }
  return name;
}

async function nameFromExisting(dir) {
  try {
    const report = JSON.parse(await readFile(path.join(dir, "audit-report.json"), "utf8"));
    const when = new Date(report.timestamp || Date.now());
    return runFolderName(report.url || "page", when);
  } catch {
    return runFolderName("page", new Date());
  }
}

async function pointLatest(artifactsDir, runName) {
  const latest = path.join(artifactsDir, "latest");
  try {
    const st = await lstat(latest);
    if (st.isSymbolicLink()) await unlink(latest);
    else throw new Error("artifacts/latest is a real directory; archive it before linking");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  await symlink(runName, latest);
}

/**
 * Move a pre-history artifacts/latest directory into a named folder
 * and point latest at it. No-op when latest is already a symlink.
 * @returns {Promise<string|null>} archived folder name
 */
export async function preserveExistingLatest(rootDir) {
  const artifactsDir = path.join(rootDir, "artifacts");
  const latest = path.join(artifactsDir, "latest");
  let st;
  try {
    st = await lstat(latest);
  } catch {
    return null;
  }
  if (st.isSymbolicLink()) return null;
  if (!st.isDirectory()) return null;
  await mkdir(artifactsDir, { recursive: true });
  const name = await uniqueName(artifactsDir, await nameFromExisting(latest));
  await rename(latest, path.join(artifactsDir, name));
  await symlink(name, latest);
  return name;
}

/**
 * Create artifacts/<timestamp>_<host> and point artifacts/latest at it.
 * @returns {Promise<{ name: string, dir: string }>}
 */
export async function beginRun(rootDir, url, date = new Date()) {
  const artifactsDir = path.join(rootDir, "artifacts");
  await mkdir(artifactsDir, { recursive: true });
  await preserveExistingLatest(rootDir);
  const name = await uniqueName(artifactsDir, runFolderName(url, date));
  const dir = path.join(artifactsDir, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "run.json"),
    JSON.stringify({ id: name, url, startedAt: date.toISOString() }, null, 2)
  );
  await pointLatest(artifactsDir, name);
  return { name, dir };
}

/** Completed and in-progress runs, newest folder name first. Skips the latest symlink. */
export async function listRuns(rootDir) {
  const artifactsDir = path.join(rootDir, "artifacts");
  let names = [];
  try {
    names = await readdir(artifactsDir);
  } catch {
    return [];
  }
  const runs = [];
  for (const name of names) {
    if (name === "latest" || name.startsWith(".")) continue;
    const dir = path.join(artifactsDir, name);
    let st;
    try {
      st = await lstat(dir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    let url = null;
    let timestamp = null;
    try {
      const run = JSON.parse(await readFile(path.join(dir, "run.json"), "utf8"));
      url = run.url || null;
      timestamp = run.startedAt || null;
    } catch {
      /* older runs may only have the audit report */
    }
    try {
      const report = JSON.parse(await readFile(path.join(dir, "audit-report.json"), "utf8"));
      url = report.url || url;
      timestamp = report.timestamp || timestamp;
    } catch {
      /* report not written yet */
    }
    let hasReport = false;
    try {
      await access(path.join(dir, "report.html"));
      hasReport = true;
    } catch {
      hasReport = false;
    }
    if (!url && !hasReport) continue;
    runs.push({
      id: name,
      url,
      timestamp,
      hasReport,
      reportUrl: hasReport ? `/artifacts/${encodeURIComponent(name)}/report.html` : null,
    });
  }
  runs.sort((a, b) => b.id.localeCompare(a.id));
  return runs;
}
