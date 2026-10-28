/**
 * Shared Playwright ingest helpers for before/after audits.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { auditSnapshot, axeToIssues, viewportProfile, sortIssuesBySeverity } from "./quality-model.mjs";
// stripInternalFields removed — use buildSkillPayload / toPublicIssue from quality-model

export const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
];

export function parseArgs(argv, defaults = {}) {
  const out = { url: "http://127.0.0.1:8765/", outDir: "artifacts/latest", ...defaults };
  for (const arg of argv) {
    if (arg.startsWith("--url=")) out.url = arg.slice(6);
    else if (arg.startsWith("--out=")) out.outDir = arg.slice(6);
  }
  // Auth flags are parsed separately via parseAuthCliFlags / resolveAuth
  return out;
}

export function dedupeIssues(allIssues) {
  // Prefer desktop screenshots, then any elementScreenshot, when merging viewports.
  const rank = (i) =>
    (i.viewport === "desktop" ? 3 : i.viewport === "tablet" ? 2 : 1) + (i.elementScreenshot ? 10 : 0);
  const byKey = new Map();
  for (const issue of allIssues) {
    const key = `${issue.selector}|${issue.css_patch?.property || ""}|${issue.problem}`;
    const prev = byKey.get(key);
    if (!prev || rank(issue) > rank(prev)) byKey.set(key, issue);
  }
  return [...byKey.values()];
}

export async function extractPageModel(page) {
  return page.evaluate(() => {
    function cssPath(el) {
      if (!el || el.nodeType !== 1) return "unknown";
      if (el.id) return `#${CSS.escape(el.id)}`;
      const parts = [];
      let cur = el;
      while (cur && cur.nodeType === 1 && parts.length < 5) {
        let part = cur.tagName.toLowerCase();
        if (cur.classList?.length) {
          part += "." + [...cur.classList].slice(0, 2).map((c) => CSS.escape(c)).join(".");
        }
        const parent = cur.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter((c) => c.tagName === cur.tagName);
          if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(cur) + 1})`;
        }
        parts.unshift(part);
        cur = parent;
        if (cur?.id) {
          parts.unshift(`#${CSS.escape(cur.id)}`);
          break;
        }
      }
      return parts.join(" > ");
    }

    function effectiveBackground(el) {
      let node = el;
      while (node && node !== document.documentElement) {
        const bg = getComputedStyle(node).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
        node = node.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    }

    const selectors = [
      "h1", "h2", "h3", "h4", "p", "li", "button", "a", "input", "textarea", "label",
      ".card", ".nav-btn", ".chip", ".search", ".ghost", ".icon-btn", ".open-btn", ".tab",
    ];

    const nodes = [];
    const seen = new WeakSet();
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        const tag = el.tagName.toLowerCase();
        const interactive =
          tag === "button" ||
          tag === "a" ||
          tag === "input" ||
          tag === "textarea" ||
          el.getAttribute("role") === "button";

        const labelId = el.getAttribute("aria-labelledby");
        const hasLabel = Boolean(
          el.getAttribute("aria-label") ||
            (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
            el.closest("label") ||
            (labelId && document.getElementById(labelId))
        );

        nodes.push({
          selector: cssPath(el),
          tag,
          className: el.className?.toString?.() || "",
          text: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 80),
          interactive,
          hasPlaceholder: Boolean(el.getAttribute("placeholder")),
          hasLabel,
          isInlineLink: tag === "a" && el.parentElement && ["p", "li", "span", "td"].includes(el.parentElement.tagName.toLowerCase()),
          role: tag === "p" ? "body-text" : undefined,
          box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          styles: {
            fontSize: cs.fontSize,
            fontWeight: cs.fontWeight,
            lineHeight: cs.lineHeight,
            fontFamily: cs.fontFamily,
            color: cs.color,
            backgroundColor: cs.backgroundColor,
            effectiveBackground: effectiveBackground(el),
            opacity: cs.opacity,
            paddingTop: cs.paddingTop,
            paddingRight: cs.paddingRight,
            paddingBottom: cs.paddingBottom,
            paddingLeft: cs.paddingLeft,
            marginTop: cs.marginTop,
            marginRight: cs.marginRight,
            marginBottom: cs.marginBottom,
            marginLeft: cs.marginLeft,
            gap: cs.gap,
            rowGap: cs.rowGap,
            columnGap: cs.columnGap,
            top: cs.top,
            right: cs.right,
            bottom: cs.bottom,
            left: cs.left,
            width: cs.width,
            height: cs.height,
            borderRadius: cs.borderRadius,
            textDecorationLine: cs.textDecorationLine,
          },
        });
      });
    }

    const docWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const clientWidth = document.documentElement.clientWidth;

    return {
      meta: {
        fontFamily: getComputedStyle(document.body).fontFamily,
        hasHorizontalOverflow: docWidth > clientWidth + 1,
        title: document.title,
      },
      nodes: nodes.slice(0, 260),
    };
  });
}

/**
 * @param {{ browser, url, viewport, absOut, phase: 'before'|'after', patchCss?: string, storageState?: string }} opts
 */
export async function auditViewport(opts) {
  const { browser, url, viewport, absOut, phase, patchCss, storageState } = opts;
  const profile = viewportProfile(viewport.width);
  const context = await browser.newContext({
    viewport,
    ...(storageState ? { storageState } : {}),
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  } catch (err) {
    await context.close();
    throw err;
  }

  if (patchCss) {
    await page.addStyleTag({ content: patchCss });
    // Let layout settle after CSS injection
    await new Promise((r) => setTimeout(r, 300));
  }

  const shotName = `${phase}-${profile.name}.png`;
  await page.screenshot({ path: path.join(absOut, shotName), fullPage: true });

  const axeRaw = await new AxeBuilder({ page }).analyze();
  const model = await extractPageModel(page);
  const layoutIssues = auditSnapshot({
    nodes: model.nodes,
    meta: model.meta,
    viewport,
  });
  const axeIssues = axeToIssues(axeRaw.violations).map((i) => ({ ...i, viewport: profile.name }));
  const issues = [...axeIssues, ...layoutIssues];

  // Capture the actual UI element for top findings (highlighted outline).
  await captureElementScreenshots(page, issues, {
    absOut,
    phase,
    viewportName: profile.name,
    limit: phase === "before" ? 36 : 16,
  });

  await context.close();

  return {
    viewport: profile,
    screenshot: shotName,
    axe: {
      violations: axeRaw.violations.length,
      passes: axeRaw.passes.length,
      incomplete: axeRaw.incomplete.length,
      details: axeRaw.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        helpUrl: v.helpUrl,
      })),
    },
    issues,
  };
}

/**
 * Screenshot each flagged element with a red highlight so the report shows the real UI.
 */
async function captureElementScreenshots(page, issues, { absOut, phase, viewportName, limit = 36 }) {
  const targets = sortIssuesBySeverity(issues)
    .filter((i) => i.selector && i.selector !== "unknown" && !String(i.selector).includes(" + "))
    .slice(0, limit);

  const relDir = path.join("elements", phase, viewportName);
  const absDir = path.join(absOut, relDir);
  await mkdir(absDir, { recursive: true });

  let idx = 0;
  for (const issue of targets) {
    idx += 1;
    const file = `el-${String(idx).padStart(3, "0")}.png`;
    const absFile = path.join(absDir, file);
    try {
      const loc = page.locator(issue.selector).first();
      const count = await loc.count();
      if (!count) continue;

      await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
      await loc.evaluate((el) => {
        el.setAttribute("data-audit-highlight", "1");
        el.style.setProperty("outline", "3px solid #ef4444", "important");
        el.style.setProperty("outline-offset", "3px", "important");
        el.style.setProperty("box-shadow", "0 0 0 4px rgba(239,68,68,0.25)", "important");
      });

      await loc.screenshot({
        path: absFile,
        timeout: 4000,
        animations: "disabled",
      });

      issue.elementScreenshot = path.join(relDir, file).replaceAll("\\", "/");

      await loc.evaluate((el) => {
        el.style.removeProperty("outline");
        el.style.removeProperty("outline-offset");
        el.style.removeProperty("box-shadow");
        el.removeAttribute("data-audit-highlight");
      }).catch(() => {});
    } catch {
      // Invalid selector / detached node — skip thumbnail
    }
  }
}
