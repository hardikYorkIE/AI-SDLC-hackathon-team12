/**
 * Build injectible CSS from audit_skill_file.md issues[].css_patch
 */

const ALLOWED_CSS_PROPS = new Set([
  "color",
  "background-color",
  "background",
  "opacity",
  "font-size",
  "font-family",
  "font-weight",
  "line-height",
  "min-height",
  "min-width",
  "height",
  "width",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "gap",
  "row-gap",
  "column-gap",
  "border-radius",
  "text-decoration",
  "text-decoration-line",
  "overflow-x",
  "overflow",
  "outline",
  "letter-spacing",
  "max-width",
]);

const PRIORITY_RULES = [
  "wcag-contrast",
  "touch-target",
  "body-type-size",
  "type-hierarchy",
  "line-height",
  "spacing-scale",
  "target-proximity",
  "link-affordance",
  "mobile-overflow",
  "brand-font",
  "shape-language",
];

function isInjectableCss(issue) {
  const prop = issue?.css_patch?.property;
  const value = issue?.css_patch?.value;
  if (!prop || value == null) return false;
  const p = String(prop).toLowerCase();
  if (!ALLOWED_CSS_PROPS.has(p)) return false;
  const v = String(value);
  if (v.includes("/*") || v.includes("add visible label")) return false;
  if (p === "outline" && v.includes("#10b981")) return false; // weak axe placeholder
  return true;
}

function rulePriority(issue) {
  const rule = String(issue.rule || "");
  if (rule.startsWith("axe:color-contrast")) return 0;
  if (rule.startsWith("axe:")) return 40;
  const idx = PRIORITY_RULES.indexOf(rule);
  return idx === -1 ? 30 : idx + 1;
}

function sanitizeSelector(selector) {
  if (!selector || selector === "unknown") return null;
  // Multi-target proximity "a + b" is not a valid single selector for patching
  if (selector.includes(" + ") && !selector.includes("+")) return null;
  if (selector.includes(" + ") && selector.split(" + ").length === 2 && !selector.includes(">")) {
    // proximity pseudo-pairs — skip
    if (!selector.includes(":") && selector.split(" + ").every((s) => s.includes("."))) {
      // still might be valid adjacent sibling; allow
    }
  }
  // Drop selectors that are clearly broken
  if (selector.length > 400) return null;
  return selector.trim();
}

/**
 * Convert issues JSON into CSS text + metadata.
 * @param {Array} issues
 * @param {{ maxRules?: number }} options
 */
export function buildPatchFromIssues(issues, options = {}) {
  const maxRules = options.maxRules ?? 80;
  const candidates = (issues || [])
    .filter(isInjectableCss)
    .map((issue) => ({
      ...issue,
      selector: sanitizeSelector(issue.selector),
    }))
    .filter((issue) => issue.selector)
    .sort((a, b) => rulePriority(a) - rulePriority(b));

  const seen = new Set();
  const applied = [];
  const lines = [
    "/* Auto-generated from audit_skill_file.md issues[].css_patch */",
    "/* Do not edit by hand — regenerate with: npm run remediate */",
    "",
  ];

  for (const issue of candidates) {
    const prop = String(issue.css_patch.property).toLowerCase();
    const value = String(issue.css_patch.value);
    const key = `${issue.selector}|${prop}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Escape nothing exotic — Playwright/browser will ignore invalid rules;
    // wrap each rule so one bad selector doesn't kill the sheet in some engines.
    lines.push(`/* ${String(issue.what_is_wrong || "").slice(0, 100).replace(/\*\//g, "* /")} */`);
    lines.push(`${issue.selector} { ${prop}: ${value} !important; }`);
    lines.push("");

    applied.push({
      selector: issue.selector,
      property: prop,
      value,
      what_is_wrong: issue.what_is_wrong,
      rule: issue.rule || null,
    });

    if (applied.length >= maxRules) break;
  }

  // Global safety-net remediations from audit_skill_file.md brand/tokens
  lines.push("/* Global skill-file safety nets */");
  lines.push(`body { font-family: Inter, system-ui, sans-serif !important; }`);
  lines.push(`p, li { line-height: 1.5 !important; }`);
  lines.push(`button, .nav-btn, .icon-btn, a.button, [role="button"] { min-height: 32px !important; min-width: 32px !important; }`);
  lines.push(`@media (max-width: 1024px) { button, .nav-btn, .icon-btn, a.button, [role="button"] { min-height: 48px !important; min-width: 48px !important; } }`);
  lines.push(`a { text-decoration: underline !important; text-underline-offset: 2px; }`);
  lines.push(`a.nav-btn, a.ghost, button a, .chip, .tab, .open-btn { text-decoration: none !important; }`);
  lines.push("");

  return {
    css: lines.join("\n"),
    applied,
    skipped: (issues || []).length - applied.length,
    maxRules,
  };
}
