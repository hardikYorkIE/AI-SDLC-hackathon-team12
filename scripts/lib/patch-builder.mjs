/**
 * Build injectible CSS from skill issues (css_patch or parse fixInstruction).
 */

const ALLOWED_CSS_PROPS = new Set([
  "color", "background-color", "background", "opacity",
  "font-size", "font-family", "font-weight", "line-height",
  "min-height", "min-width", "height", "width",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "gap", "row-gap", "column-gap", "border-radius",
  "text-decoration", "text-decoration-line", "overflow-x", "overflow",
  "outline", "letter-spacing", "max-width",
]);

function extractCssPatch(issue) {
  if (issue?.css_patch?.property && issue?.css_patch?.value != null) {
    return { property: String(issue.css_patch.property).toLowerCase(), value: String(issue.css_patch.value) };
  }
  const text = String(issue?.fixInstruction || "");
  const m = text.match(/Apply CSS:\s*([a-z-]+)\s*:\s*([^;]+);/i);
  if (m) return { property: m[1].toLowerCase(), value: m[2].trim() };
  const m2 = text.match(/\b([a-z-]+)\s*:\s*([^;]{1,40});/i);
  if (m2 && ALLOWED_CSS_PROPS.has(m2[1].toLowerCase())) {
    return { property: m2[1].toLowerCase(), value: m2[2].trim() };
  }
  return null;
}

function isInjectable(issue, patch) {
  if (!patch) return false;
  if (!ALLOWED_CSS_PROPS.has(patch.property)) return false;
  if (patch.value.includes("/*") || patch.value.includes("Describe this")) return false;
  if (patch.property === "outline") return false;
  if (patch.property === "aria-label" || patch.property === "alt") return false;
  return true;
}

function severityRank(s) {
  return { Critical: 0, High: 1, Medium: 2, Low: 3 }[s] ?? 5;
}

function sanitizeSelector(selector) {
  if (!selector || selector === "unknown") return null;
  if (selector.length > 400) return null;
  return selector.trim();
}

export function buildPatchFromIssues(issues, options = {}) {
  const maxRules = options.maxRules ?? 80;
  const enriched = (issues || [])
    .map((issue) => ({ issue, patch: extractCssPatch(issue) }))
    .filter(({ issue, patch }) => isInjectable(issue, patch) && sanitizeSelector(issue.selector))
    .sort((a, b) => severityRank(a.issue.severity) - severityRank(b.issue.severity));

  const seen = new Set();
  const applied = [];
  const lines = [
    "/* Auto-generated from audit_skill_file.md issues */",
    "/* Regenerate: npm run remediate */",
    "",
  ];

  for (const { issue, patch } of enriched) {
    const selector = sanitizeSelector(issue.selector);
    const key = `${selector}|${patch.property}`;
    if (seen.has(key)) continue;
    seen.add(key);

    lines.push(`/* [${issue.severity}] ${String(issue.problem || "").slice(0, 100).replace(/\*\//g, "* /")} */`);
    lines.push(`${selector} { ${patch.property}: ${patch.value} !important; }`);
    lines.push("");

    applied.push({
      selector,
      property: patch.property,
      value: patch.value,
      severity: issue.severity,
      category: issue.category,
      problem: issue.problem,
    });
    if (applied.length >= maxRules) break;
  }

  lines.push("/* Universal safety nets (any site) */");
  lines.push(`p, li { line-height: 1.5 !important; }`);
  lines.push(`button, [role="button"], input[type="button"], input[type="submit"] { min-height: 24px !important; min-width: 24px !important; }`);
  lines.push(`@media (max-width: 1024px) { button, [role="button"], input[type="button"], input[type="submit"] { min-height: 48px !important; min-width: 48px !important; } }`);
  lines.push(`p a, li a, article a { text-decoration: underline !important; text-underline-offset: 2px; }`);
  lines.push("");

  return {
    css: lines.join("\n"),
    applied,
    skipped: (issues || []).length - applied.length,
    maxRules,
  };
}
