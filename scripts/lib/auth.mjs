/**
 * Authenticated-page support for the audit harness.
 * Login once → save Playwright storageState → reuse across viewports.
 * Passwords are never written into skill JSON / report artifacts.
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SELECTORS = {
  username:
    'input[type="email"], input[name="email"], input[name="username"], input[name="user"], input[id="email"], input[id="username"], input[autocomplete="username"]',
  password: 'input[type="password"], input[name="password"], input[autocomplete="current-password"]',
  submit:
    'button[type="submit"], input[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login"), button:has-text("Continue")',
};

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Minimal .env loader (no dotenv dependency). */
async function loadDotEnv(rootDir) {
  const envPath = path.join(rootDir, ".env");
  if (!(await exists(envPath))) return {};
  const text = await readFile(envPath, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).length) return String(obj[k]);
  }
  return undefined;
}

/**
 * Merge CLI flags, env / .env, and optional auth config JSON.
 * @returns {Promise<{
 *   enabled: boolean,
 *   loginUrl?: string,
 *   username?: string,
 *   password?: string,
 *   selectors: typeof DEFAULT_SELECTORS,
 *   successUrlIncludes?: string,
 *   waitAfterMs: number,
 *   storageStatePath?: string,
 *   authConfigPath?: string,
 * }>}
 */
export async function resolveAuth(cli = {}, { rootDir = process.cwd() } = {}) {
  const fileEnv = await loadDotEnv(rootDir);
  const env = { ...fileEnv, ...process.env };

  let fileCfg = {};
  const authConfigPath =
    cli.authConfig ||
    pick(env, "AUDIT_AUTH_CONFIG") ||
    (await exists(path.join(rootDir, "auth.config.json"))
      ? path.join(rootDir, "auth.config.json")
      : undefined);

  if (authConfigPath && (await exists(path.resolve(authConfigPath)))) {
    fileCfg = JSON.parse(await readFile(path.resolve(authConfigPath), "utf8"));
  }

  const selectors = {
    ...DEFAULT_SELECTORS,
    ...(fileCfg.selectors || {}),
    ...(cli.userSelector ? { username: cli.userSelector } : {}),
    ...(cli.passSelector ? { password: cli.passSelector } : {}),
    ...(cli.submitSelector ? { submit: cli.submitSelector } : {}),
  };

  const username =
    cli.user ||
    pick(env, "AUDIT_USER", "AUDIT_USERNAME", "AUDIT_EMAIL") ||
    fileCfg.username ||
    fileCfg.user ||
    fileCfg.email;
  const password =
    cli.password || pick(env, "AUDIT_PASSWORD", "AUDIT_PASS") || fileCfg.password;
  const loginUrl =
    cli.loginUrl ||
    pick(env, "AUDIT_LOGIN_URL") ||
    fileCfg.loginUrl ||
    fileCfg.login_url;
  const storageStatePath =
    cli.storageState ||
    pick(env, "AUDIT_STORAGE_STATE") ||
    fileCfg.storageState ||
    fileCfg.storage_state;
  const successUrlIncludes =
    cli.successUrlIncludes ||
    pick(env, "AUDIT_SUCCESS_URL") ||
    fileCfg.successUrlIncludes ||
    fileCfg.success_url_includes;
  const waitAfterMs = Number(
    cli.waitAfterMs ||
      pick(env, "AUDIT_AUTH_WAIT_MS") ||
      fileCfg.waitAfterMs ||
      fileCfg.wait_after_ms ||
      1500
  );

  const enabled = Boolean(
    storageStatePath || (username && password && (loginUrl || cli.targetUrl))
  );

  return {
    enabled,
    loginUrl: loginUrl || cli.targetUrl,
    username,
    password,
    selectors,
    successUrlIncludes,
    waitAfterMs: Number.isFinite(waitAfterMs) ? waitAfterMs : 1500,
    storageStatePath,
    authConfigPath,
  };
}

/**
 * Extend parseArgs-style objects with auth CLI flags.
 */
export function parseAuthCliFlags(argv, base = {}) {
  const out = { ...base };
  for (const arg of argv) {
    if (arg.startsWith("--user=")) out.user = arg.slice(7);
    else if (arg.startsWith("--username=")) out.user = arg.slice(11);
    else if (arg.startsWith("--email=")) out.user = arg.slice(8);
    else if (arg.startsWith("--password=")) out.password = arg.slice(11);
    else if (arg.startsWith("--pass=")) out.password = arg.slice(7);
    else if (arg.startsWith("--login-url=")) out.loginUrl = arg.slice(12);
    else if (arg.startsWith("--auth=")) out.authConfig = arg.slice(7);
    else if (arg.startsWith("--auth-config=")) out.authConfig = arg.slice(14);
    else if (arg.startsWith("--storage-state=")) out.storageState = arg.slice(16);
    else if (arg.startsWith("--auth-user-selector=")) out.userSelector = arg.slice(21);
    else if (arg.startsWith("--auth-pass-selector=")) out.passSelector = arg.slice(21);
    else if (arg.startsWith("--auth-submit-selector=")) out.submitSelector = arg.slice(23);
    else if (arg.startsWith("--auth-success-url=")) out.successUrlIncludes = arg.slice(19);
    else if (arg.startsWith("--auth-wait-ms=")) out.waitAfterMs = arg.slice(15);
  }
  return out;
}

/**
 * Ensure we have a Playwright storageState file (login if needed).
 * @returns {Promise<string|undefined>} absolute path to storage state, or undefined
 */
export async function ensureAuthStorage(browser, auth, { absOut, targetUrl } = {}) {
  if (!auth?.enabled) return undefined;

  if (auth.storageStatePath) {
    const abs = path.resolve(auth.storageStatePath);
    if (!(await exists(abs))) {
      throw new Error(`storage state not found: ${abs}`);
    }
    console.log(`   auth: reusing storage state (${path.basename(abs)})`);
    return abs;
  }

  if (!auth.username || !auth.password) {
    throw new Error("Auth enabled but username/password missing. Use --user / --password or auth.config.json");
  }

  const loginUrl = auth.loginUrl || targetUrl;
  if (!loginUrl) throw new Error("Auth needs --login-url= (or loginUrl in auth.config.json)");

  await mkdir(absOut, { recursive: true });
  const statePath = path.join(absOut, "auth-storage.json");

  console.log(`   auth: logging in at ${loginUrl}`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    const userLoc = page.locator(auth.selectors.username).first();
    const passLoc = page.locator(auth.selectors.password).first();
    await userLoc.waitFor({ state: "visible", timeout: 20000 });
    await passLoc.waitFor({ state: "visible", timeout: 20000 });

    await userLoc.fill(auth.username);
    await passLoc.fill(auth.password);

    const submit = page.locator(auth.selectors.submit).first();
    if ((await submit.count()) > 0) {
      await Promise.all([
        page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {}),
        submit.click(),
      ]);
    } else {
      await passLoc.press("Enter");
      await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
    }

    if (auth.waitAfterMs > 0) {
      await new Promise((r) => setTimeout(r, auth.waitAfterMs));
    }

    const href = page.url();
    const loginPath = (() => {
      try {
        return new URL(loginUrl).pathname.replace(/\/$/, "") || "/";
      } catch {
        return "/login";
      }
    })();
    const stillOnLoginPage =
      href.includes("/login") ||
      ((await page.locator(auth.selectors.password).count()) > 0 &&
        new URL(href).pathname.replace(/\/$/, "") === loginPath);

    if (stillOnLoginPage) {
      throw new Error(
        `Login may have failed — still on login UI (${href}). Check AUDIT_USER / AUDIT_PASSWORD.`
      );
    }

    if (auth.successUrlIncludes && !href.includes(auth.successUrlIncludes)) {
      // Soft fail: left login but landed elsewhere than expected (e.g. / vs /dashboard)
      console.warn(
        `   auth: warning — expected URL to include "${auth.successUrlIncludes}", got ${href} (continuing)`
      );
    } else {
      console.log(`   auth: logged in → ${href}`);
    }

    await context.storageState({ path: statePath });
    console.log(`   auth: session saved → ${path.relative(process.cwd(), statePath)}`);
    return statePath;
  } catch (err) {
    await context.close().catch(() => {});
    throw new Error(`Login failed: ${err.message || err}`);
  } finally {
    await context.close().catch(() => {});
  }
}

/** Redact secrets from objects that might be logged. */
export function authLogSummary(auth) {
  if (!auth?.enabled) return "off";
  if (auth.storageStatePath) return `storage-state`;
  return `login as ${auth.username || "?"} @ ${auth.loginUrl || "?"}`;
}
