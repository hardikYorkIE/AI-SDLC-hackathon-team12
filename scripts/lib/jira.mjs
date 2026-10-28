/**
 * Create one Jira task per selected audit finding.
 * Config lives in jira.config.json (gitignored) or JIRA_* env vars.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
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

export function descriptionFor(issue, report) {
  const page = report?.url || "the audited page";
  const lines = [
    "Context",
    `UI/UX audit of ${page} found a ${issue?.severity || "unspecified"} ${issue?.category || "UI"} issue.`,
    "",
    "Problem",
    issue?.problem || "See the audited element.",
    "",
    "Why it is wrong",
    issue?.whyItIsWrong || "The element does not meet the cited framework rule.",
    "",
    "Requirements",
    issue?.fixInstruction || "Apply the fix described in the audit.",
    "",
    "Technical notes",
    `Selector: ${issue?.selector || "unknown"}`,
    `Framework: ${issue?.frameworkViolation || "n/a"}`,
    `Category: ${issue?.category || "n/a"}`,
    `Severity: ${issue?.severity || "n/a"}`,
    `Audit fingerprint: ${fingerprint(issue)}`,
    "",
    "Acceptance criteria",
    issue?.impact || "The finding no longer reproduces on the audited page.",
    "",
    "Resources",
    `Audited page: ${page}`,
  ];
  if (issue?.elementScreenshot) lines.push(`Element screenshot: ${issue.elementScreenshot}`);
  if (report?.timestamp) lines.push(`Audit time: ${report.timestamp}`);
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

function adf(text) {
  return {
    type: "doc",
    version: 1,
    content: String(text)
      .split("\n")
      .map((line) => ({
        type: "paragraph",
        content: line ? [{ type: "text", text: line }] : [],
      })),
  };
}

function configPath(root) {
  return path.join(root, "jira.config.json");
}

function normalizeConfig(input) {
  const baseUrl = String(input?.baseUrl || input?.JIRA_BASE_URL || "").trim().replace(/\/+$/, "");
  const email = String(input?.email || input?.JIRA_EMAIL || "").trim();
  const apiToken = String(input?.apiToken || input?.JIRA_API_TOKEN || "").trim();
  const projectKey = String(input?.projectKey || input?.JIRA_PROJECT_KEY || "").trim().toUpperCase();
  const issueType = String(input?.issueType || input?.JIRA_ISSUE_TYPE || "Task").trim() || "Task";
  return { baseUrl, email, apiToken, projectKey, issueType };
}

function assertConfig(config) {
  let parsed;
  try {
    parsed = new URL(config.baseUrl);
  } catch {
    const error = new Error("Jira site must be a full https URL, such as https://your-site.atlassian.net.");
    error.status = 400;
    throw error;
  }
  if (parsed.protocol !== "https:") {
    const error = new Error("Jira site must use https.");
    error.status = 400;
    throw error;
  }
  if (!config.email || !config.email.includes("@")) {
    const error = new Error("Enter the Atlassian account email for this API token.");
    error.status = 400;
    throw error;
  }
  if (!config.apiToken || config.apiToken.length < 8) {
    const error = new Error("Enter a Jira API token.");
    error.status = 400;
    throw error;
  }
  if (!/^[A-Z][A-Z0-9]+$/.test(config.projectKey)) {
    const error = new Error("Project key should look like UX or TEAM.");
    error.status = 400;
    throw error;
  }
  return config;
}

export async function loadJiraConfig(root) {
  let file = {};
  try {
    file = JSON.parse(await readFile(configPath(root), "utf8"));
  } catch {
    file = {};
  }
  const config = normalizeConfig({
    baseUrl: process.env.JIRA_BASE_URL || file.baseUrl,
    email: process.env.JIRA_EMAIL || file.email,
    apiToken: process.env.JIRA_API_TOKEN || file.apiToken,
    projectKey: process.env.JIRA_PROJECT_KEY || file.projectKey,
    issueType: process.env.JIRA_ISSUE_TYPE || file.issueType,
  });
  if (!config.baseUrl || !config.email || !config.apiToken || !config.projectKey) return null;
  return config;
}

export async function jiraStatus(root) {
  const config = await loadJiraConfig(root);
  if (!config) return { configured: false };
  return {
    configured: true,
    projectKey: config.projectKey,
    issueType: config.issueType,
    site: new URL(config.baseUrl).host,
  };
}

async function jiraFetch(config, apiPath, options = {}) {
  const response = await fetch(new URL(apiPath, `${config.baseUrl}/`), {
    ...options,
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  return response;
}

async function jiraError(response) {
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  const messages = [];
  if (Array.isArray(data?.errorMessages)) messages.push(...data.errorMessages);
  if (data?.errors && typeof data.errors === "object") {
    for (const [field, message] of Object.entries(data.errors)) messages.push(`${field}: ${message}`);
  }
  return messages.filter(Boolean).join("; ") || `Jira returned ${response.status}.`;
}

export async function saveJiraConfig(root, input) {
  const config = assertConfig(normalizeConfig(input));
  const me = await jiraFetch(config, "/rest/api/3/myself");
  if (me.status === 401 || me.status === 403) {
    const error = new Error("Jira rejected that email and API token.");
    error.status = 401;
    throw error;
  }
  if (!me.ok) {
    const error = new Error(await jiraError(me));
    error.status = 502;
    throw error;
  }
  const project = await jiraFetch(config, `/rest/api/3/project/${encodeURIComponent(config.projectKey)}`);
  if (project.status === 404) {
    const error = new Error(`Jira project ${config.projectKey} was not found on that site.`);
    error.status = 404;
    throw error;
  }
  if (!project.ok) {
    const error = new Error(await jiraError(project));
    error.status = 502;
    throw error;
  }
  await writeFile(configPath(root), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  const account = await me.json().catch(() => ({}));
  return {
    configured: true,
    projectKey: config.projectKey,
    issueType: config.issueType,
    site: new URL(config.baseUrl).host,
    account: account.displayName || account.emailAddress || config.email,
  };
}

export async function readJiraLinks(runDir) {
  try {
    const data = JSON.parse(await readFile(path.join(runDir, LINKS_FILE), "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

async function writeJiraLinks(runDir, links) {
  await writeFile(path.join(runDir, LINKS_FILE), `${JSON.stringify(links, null, 2)}\n`);
}

function browseUrl(config, key) {
  return `${config.baseUrl}/browse/${key}`;
}

async function findExisting(config, fp) {
  const jql = `project = ${config.projectKey} AND labels = "audit-${fp}" ORDER BY created DESC`;
  const response = await jiraFetch(config, "/rest/api/3/search/jql", {
    method: "POST",
    body: JSON.stringify({ jql, maxResults: 1, fields: ["key"] }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const issue = data.issues?.[0] || data.values?.[0];
  if (!issue?.key) return null;
  return { key: issue.key, url: browseUrl(config, issue.key) };
}

async function createIssue(config, issue, report) {
  const fp = fingerprint(issue);
  const fields = {
    project: { key: config.projectKey },
    summary: summaryFor(issue),
    description: adf(descriptionFor(issue, report)),
    issuetype: { name: config.issueType },
    labels: ["ui-audit", `audit-${fp}`, labelFor(issue.category)].filter(Boolean),
  };
  let response = await jiraFetch(config, "/rest/api/3/issue", {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) {
    const message = await jiraError(response);
    if (!/label/i.test(message)) {
      const error = new Error(message);
      error.status = response.status === 401 || response.status === 403 ? 401 : 502;
      throw error;
    }
    delete fields.labels;
    response = await jiraFetch(config, "/rest/api/3/issue", {
      method: "POST",
      body: JSON.stringify({ fields }),
    });
    if (!response.ok) {
      const error = new Error(await jiraError(response));
      error.status = response.status === 401 || response.status === 403 ? 401 : 502;
      throw error;
    }
  }
  const created = await response.json();
  return {
    key: created.key,
    url: browseUrl(config, created.key),
    summary: fields.summary,
  };
}

export async function createJiraTasks(root, runDir, report, issues) {
  const config = await loadJiraConfig(root);
  if (!config) {
    const error = new Error("Connect Jira first. Add the site, email, API token, and project key.");
    error.status = 400;
    throw error;
  }
  const links = await readJiraLinks(runDir);
  const results = [];
  for (const item of issues) {
    const fp = fingerprint(item.issue);
    const known = links[fp];
    if (known?.key && known?.url) {
      results.push({ index: item.index, key: known.key, url: known.url, summary: known.summary || summaryFor(item.issue), created: false });
      continue;
    }
    const remote = await findExisting(config, fp);
    if (remote) {
      links[fp] = { ...remote, summary: summaryFor(item.issue), createdAt: new Date().toISOString() };
      await writeJiraLinks(runDir, links);
      results.push({ index: item.index, ...remote, summary: links[fp].summary, created: false });
      continue;
    }
    try {
      const created = await createIssue(config, item.issue, report);
      links[fp] = { key: created.key, url: created.url, summary: created.summary, createdAt: new Date().toISOString() };
      await writeJiraLinks(runDir, links);
      results.push({ index: item.index, ...created, created: true });
    } catch (err) {
      err.results = results;
      throw err;
    }
  }
  return { results };
}
