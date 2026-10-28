#!/usr/bin/env node
/**
 * One page to audit a URL (optional login) and open the report.
 *   npm run ui
 *   http://127.0.0.1:8787
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, readFile, readlink, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiraTasks, jiraStatus, saveJiraConfig, withJiraLock } from "./lib/jira.mjs";
import { listRuns } from "./lib/runs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACTS_ROOT = path.join(ROOT, "artifacts");
const ARTIFACTS = path.join(ARTIFACTS_ROOT, "latest");
const UI_HTML = path.join(ROOT, "ui", "index.html");
const HOST = "127.0.0.1";
const PORT = Number(process.env.AUDIT_UI_PORT || 8787);
const REPORT_PATH = "/artifacts/latest/report.html";

const SECRET_ENV = [
  "AUDIT_USER",
  "AUDIT_USERNAME",
  "AUDIT_EMAIL",
  "AUDIT_PASSWORD",
  "AUDIT_PASS",
  "AUDIT_LOGIN_URL",
  "AUDIT_AUTH_CONFIG",
  "AUDIT_STORAGE_STATE",
  "AUDIT_SUCCESS_URL",
];

const state = {
  running: false,
  phase: "idle",
  log: "",
  error: null,
  finishedAt: null,
};

function childEnv() {
  const env = { ...process.env, AUDIT_NO_OPEN: "1" };
  for (const key of SECRET_ENV) delete env[key];
  return env;
}

function appendLog(text, secret) {
  let clean = String(text);
  if (secret && secret.length >= 1) clean = clean.split(secret).join("••••••");
  state.log = (state.log + clean).slice(-16000);
}

function runScript(script, args, env, secret) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, script), ...args], {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const onData = (buf) => {
      const text = buf.toString();
      process.stdout.write(text);
      appendLog(text, secret);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

async function reportExists() {
  try {
    await access(path.join(ARTIFACTS, "report.html"));
    return true;
  } catch {
    return false;
  }
}

async function runAudit({ url, username, password }) {
  const args = [`--url=${url}`, "--auth-inline"];
  if (username && password) {
    args.push(`--login-url=${url}`, `--user=${username}`, `--password=${password}`);
  }
  const env = childEnv();
  const secret = password || "";
  try {
    state.phase = "audit";
    appendLog(`\nAuditing ${url}\n`, secret);
    await runScript("scripts/audit.mjs", args, env, secret);
    state.phase = "remediate";
    await runScript("scripts/remediate.mjs", [], env, secret);
    state.phase = "audit-after";
    await runScript("scripts/audit-after.mjs", args, env, secret);
    state.phase = "report";
    await runScript("scripts/report.mjs", [], env, secret);
    state.phase = "done";
    state.error = null;
    appendLog("\nReport ready.\n", secret);
  } catch (err) {
    state.phase = "error";
    state.error = err.message || String(err);
    appendLog(`\n${state.error}\n`, secret);
  } finally {
    state.running = false;
    state.finishedAt = new Date().toISOString();
  }
}

function parseTarget(body) {
  const urlRaw = String(body.url || "").trim();
  if (!urlRaw) {
    const error = new Error("Enter a page URL.");
    error.status = 400;
    throw error;
  }
  let parsed;
  try {
    parsed = new URL(urlRaw);
  } catch {
    const error = new Error("Enter a valid http or https URL.");
    error.status = 400;
    throw error;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    const error = new Error("URL must start with http:// or https://.");
    error.status = 400;
    throw error;
  }
  if (parsed.username || parsed.password) {
    const error = new Error("Put the username and password in the login fields, not in the URL.");
    error.status = 400;
    throw error;
  }
  if (!parsed.hostname) {
    const error = new Error("Enter a valid http or https URL.");
    error.status = 400;
    throw error;
  }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if ((username && !password) || (!username && password)) {
    const error = new Error("Login needs both a username and a password.");
    error.status = 400;
    throw error;
  }
  return { url: parsed.href, username, password };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

const RUN_ID = /^(?:latest|\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_[a-z0-9][a-z0-9._-]*)$/;

function artifactFile(urlPath) {
  const match = urlPath.match(/^\/artifacts\/([^/]+)\/(.+)$/);
  if (!match || !RUN_ID.test(match[1])) return null;
  let rel;
  try {
    rel = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  if (!rel || rel.includes("\0") || rel.split("/").some((part) => !part || part === "." || part === "..")) {
    return null;
  }
  const runDir = path.resolve(ARTIFACTS_ROOT, match[1]);
  const abs = path.resolve(runDir, rel);
  const root = runDir + path.sep;
  if (!abs.startsWith(root)) return null;
  if (path.basename(abs) === "auth-storage.json") return null;
  if (!/\.(html|png|jpe?g|webp|gif|css)$/i.test(abs)) return null;
  return abs;
}

async function insideArtifacts(file) {
  const root = await realpath(ARTIFACTS_ROOT);
  const abs = await realpath(file);
  return abs === root || abs.startsWith(root + path.sep);
}

async function resolveRunDir(runId) {
  const id = String(runId || "latest");
  if (!RUN_ID.test(id)) {
    const error = new Error("Unknown audit run.");
    error.status = 400;
    throw error;
  }
  const dir = path.resolve(ARTIFACTS_ROOT, id);
  let root;
  let abs;
  try {
    root = await realpath(ARTIFACTS_ROOT);
    abs = await realpath(dir);
  } catch {
    const error = new Error("Unknown audit run.");
    error.status = 404;
    throw error;
  }
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    const error = new Error("Unknown audit run.");
    error.status = 400;
    throw error;
  }
  return abs;
}

async function currentRunId() {
  try {
    const target = await readlink(ARTIFACTS);
    return path.basename(target);
  } catch {
    return null;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 65536) {
        const error = new Error("Request body is too large.");
        error.status = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${HOST}`);
    const pathname = url.pathname;

    if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      const html = await readFile(UI_HTML);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(html);
      return;
    }

    if (req.method === "GET" && pathname === "/report") {
      if (!(await reportExists())) {
        sendJson(res, 404, { error: "No report yet. Generate one from the form." });
        return;
      }
      res.writeHead(302, { Location: REPORT_PATH, "Cache-Control": "no-store" });
      res.end();
      return;
    }

    if (req.method === "GET" && pathname === "/api/status") {
      const ready = !state.running && (await reportExists());
      sendJson(res, 200, {
        running: state.running,
        phase: state.phase,
        log: state.log,
        error: state.error,
        finishedAt: state.finishedAt,
        reportUrl: ready ? "/report" : null,
        runId: await currentRunId(),
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/history") {
      sendJson(res, 200, await listRuns(ROOT));
      return;
    }

    if (req.method === "GET" && pathname === "/api/jira/status") {
      sendJson(res, 200, await jiraStatus(ROOT));
      return;
    }

    if (req.method === "POST" && pathname === "/api/jira/config") {
      const raw = await readBody(req);
      let body = {};
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        sendJson(res, 400, { error: "Send a JSON body with the Jira site, email, token, and project key." });
        return;
      }
      const saved = await saveJiraConfig(ROOT, body);
      sendJson(res, 200, saved);
      return;
    }

    if (req.method === "POST" && pathname === "/api/jira/tasks") {
      const raw = await readBody(req);
      let body = {};
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        sendJson(res, 400, { error: "Send a JSON body with the selected findings." });
        return;
      }
      const runDir = await resolveRunDir(body.runId);
      let report;
      try {
        report = JSON.parse(await readFile(path.join(runDir, "audit-report.json"), "utf8"));
      } catch {
        sendJson(res, 404, { error: "This run has no audit report." });
        return;
      }
      const issues = report.issues || [];
      const indexes = [...new Set(Array.isArray(body.indexes) ? body.indexes : [])];
      if (!indexes.length) {
        sendJson(res, 400, { error: "Select at least one finding." });
        return;
      }
      if (indexes.length > 20) {
        sendJson(res, 400, { error: "Select up to 20 findings at a time." });
        return;
      }
      if (indexes.some((n) => !Number.isInteger(n) || n < 0 || n >= issues.length)) {
        sendJson(res, 400, { error: "One of the selected findings is not in this report." });
        return;
      }
      try {
        const payload = await withJiraLock(() =>
          createJiraTasks(
            ROOT,
            runDir,
            report,
            indexes.map((index) => ({ index, issue: issues[index] }))
          )
        );
        sendJson(res, 200, payload);
      } catch (err) {
        sendJson(res, err.status || 502, {
          error: err.message || "Could not create Jira tasks.",
          results: err.results || [],
        });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/api/audit") {
      const raw = await readBody(req);
      let body = {};
      if (raw.trim()) {
        try {
          body = JSON.parse(raw);
        } catch {
          sendJson(res, 400, { error: "Send a JSON body with a url field." });
          return;
        }
      }
      const job = parseTarget(body);
      if (state.running) {
        sendJson(res, 409, { error: "An audit is already running." });
        return;
      }
      state.running = true;
      state.phase = "starting";
      state.log = "";
      state.error = null;
      state.finishedAt = null;
      runAudit(job);
      sendJson(res, 202, {
        ok: true,
        url: job.url,
        authenticated: Boolean(job.username),
      });
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/artifacts/")) {
      const file = artifactFile(pathname);
      if (!file) {
        sendJson(res, 404, { error: "Not found." });
        return;
      }
      let info;
      try {
        info = await stat(file);
      } catch {
        sendJson(res, 404, { error: "Not found." });
        return;
      }
      if (!info.isFile() || !(await insideArtifacts(file))) {
        sendJson(res, 404, { error: "Not found." });
        return;
      }
      const data = await readFile(file);
      res.writeHead(200, {
        "Content-Type": contentType(file),
        "Cache-Control": "no-store",
        "Content-Length": data.length,
      });
      res.end(data);
      return;
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (err) {
    const status = err.status || 500;
    sendJson(res, status, { error: err.message || "Request failed." });
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\nPort ${PORT} is already in use. The audit form is already running at http://${HOST}:${PORT}\n`
    );
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`\nAudit form: http://${HOST}:${PORT}`);
  console.log(`Report link (after a run): http://${HOST}:${PORT}/report\n`);
});
