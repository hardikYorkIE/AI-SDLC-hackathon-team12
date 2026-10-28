/**
 * Queue one Jira task per selected audit finding.
 * The connected Atlassian account files each task in project KAN.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const LINKS_FILE = "jira-links.json";

let queue = Promise.resolve();

export function withJiraLock(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => {},
    () => {}
  );
  return run;
}

export function fingerprint(issue) {
  const raw = [issue?.severity, issue?.category, issue?.selector, issue?.problem].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export function elementName(selector) {
  const last = String(selector || "")
    .split(">")
    .pop()
    .trim();
  const id = last.match(/#([A-Za-z][A-Za-z0-9_-]*)/);
  const classes = [...last.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((match) => match[1]);
  const source = id?.[1] || classes.find((name) => !name.includes("--")) || classes.at(-1) || last.match(/^([a-z0-9]+)/i)?.[1] || "element";
  return source.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function summaryFor(issue) {
  const problem = String(issue?.problem || "UI issue")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "");
  let text = `Fix ${elementName(issue?.selector)}: ${problem}`;
  if (text.length > 250) text = `${text.slice(0, 247)}...`;
  return text;
}

export const JIRA_CONNECTION = {
  cloudId: "dce972ed-a34b-4a1b-bdcb-cd5595b233d4",
  site: "https://hardiksavaliya48.atlassian.net",
  projectKey: "KAN",
  projectName: "UI/UX Audit",
  issueType: "Task",
};

export function descriptionFor(issue, report) {
  const page = report?.url || "the audited page";
  const lines = [
    "## Context",
    `UI/UX audit of ${page} found a ${issue?.severity || "unspecified"} ${issue?.category || "UI"} issue.`,
    "",
    "## Problem",
    issue?.problem || "See the audited element.",
    "",
    "## Why it is wrong",
    issue?.whyItIsWrong || "The element does not meet the cited framework rule.",
    "",
    "## Requirements",
    issue?.fixInstruction || "Apply the fix described in the audit.",
    "",
    "## Technical notes",
    `- Selector: \`${issue?.selector || "unknown"}\``,
    `- Framework: ${issue?.frameworkViolation || "n/a"}`,
    `- Category: ${issue?.category || "n/a"}`,
    `- Severity: ${issue?.severity || "n/a"}`,
    `- Audit fingerprint: ${fingerprint(issue)}`,
    "",
    "## Acceptance criteria",
    `- [ ] ${issue?.impact || "The finding no longer reproduces on the audited page."}`,
    "",
    "## Resources",
    `- Audited page: ${page}`,
  ];
  if (issue?.elementScreenshot) lines.push(`- Element screenshot: ${issue.elementScreenshot}`);
  if (report?.timestamp) lines.push(`- Audit time: ${report.timestamp}`);
  return lines.join("\n");
}

function labelFor(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function labelsFor(issue) {
  return ["ui-audit", `audit-${fingerprint(issue)}`, labelFor(issue?.category)].filter(Boolean);
}

export function jiraStatus() {
  return {
    configured: true,
    via: "mcp",
    projectKey: JIRA_CONNECTION.projectKey,
    projectName: JIRA_CONNECTION.projectName,
    issueType: JIRA_CONNECTION.issueType,
    site: new URL(JIRA_CONNECTION.site).host,
  };
}

function queueDir(root) {
  return path.join(root, "artifacts", "jira-queue");
}

export async function readJiraLinks(runDir) {
  try {
    const data = JSON.parse(await readFile(path.join(runDir, LINKS_FILE), "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function enqueueJiraTasks(root, runDir, report, issues) {
  const links = await readJiraLinks(runDir);
  const results = [];
  const pending = [];
  for (const item of issues) {
    const fp = fingerprint(item.issue);
    const known = links[fp];
    if (known?.key && known?.url) {
      results.push({
        index: item.index,
        key: known.key,
        url: known.url,
        summary: known.summary || summaryFor(item.issue),
        created: false,
      });
      continue;
    }
    pending.push({
      index: item.index,
      fingerprint: fp,
      summary: summaryFor(item.issue),
      description: descriptionFor(item.issue, report),
      labels: labelsFor(item.issue),
    });
  }
  if (!pending.length) return { jobId: null, results, pending: [] };

  const jobId = randomUUID();
  const job = {
    id: jobId,
    runDir,
    ...JIRA_CONNECTION,
    createdAt: new Date().toISOString(),
    items: pending,
  };
  const dir = queueDir(root);
  await mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${jobId}.json`);
  const tmp = path.join(dir, `${jobId}.json.tmp`);
  await writeFile(tmp, `${JSON.stringify(job, null, 2)}\n`);
  await rename(tmp, dest);
  return { jobId, results, pending: pending.map((item) => item.index) };
}

export async function readJiraJob(root, jobId) {
  if (!JOB_ID.test(String(jobId || ""))) return null;
  try {
    const data = JSON.parse(await readFile(path.join(queueDir(root), `${jobId}.result.json`), "utf8"));
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}
