/**
 * Quality model from audit_skill_file.md (uploaded skill schema).
 */

export const QUALITY_MODEL = {
  source: "audit_skill_file.md",
  breakpoints: {
    mobile: { max: 767, label: "mobile" },
    tablet: { min: 768, max: 1024, label: "tablet" },
    desktop: { min: 1025, label: "desktop" },
  },
  // Base spacing 8px; values must be divisible by 4 or 8 (= divisible by 4).
  spacingBasePx: 8,
  spacingDivisorPx: 4,
  touchTargets: {
    mobile: 48,
    tablet: 48,
    desktop: 24, // WCAG 2.2 SC 2.5.8
  },
  typography: {
    minBodyDesktopPx: 14,
    minBodyMobilePx: 16,
    lineHeightRatio: 1.5,
  },
  brand: {
    primary: "#0f172a",
    background: "#ffffff",
    danger: "#ef4444",
    success: "#10b981",
    fonts: [],
    enforce_fonts: false,
    enforce_colors: false,
  },
  wcag: {
    normalContrast: 4.5,
    largeContrast: 3.0,
  },
};

const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

const RULE_META = {
  "spacing-scale": {
    severity: "Medium",
    category: "Consistency",
    frameworkViolation: "8px spacing scale (divisible by 4 or 8)",
  },
  "touch-target": {
    severity: "High",
    category: "Ergonomics",
    frameworkViolation: "WCAG 2.2 SC 2.5.8 / Fitts's Law",
  },
  "target-proximity": {
    severity: "High",
    category: "Ergonomics",
    frameworkViolation: "Fitts's Law",
  },
  "body-type-size": {
    severity: "Medium",
    category: "Typography",
    frameworkViolation: "Nielsen Heuristic #4 - Consistency and Standards",
  },
  "line-height": {
    severity: "Low",
    category: "Typography",
    frameworkViolation: "Nielsen Heuristic #4 - Consistency and Standards",
  },
  "type-hierarchy": {
    severity: "High",
    category: "Typography",
    frameworkViolation: "Nielsen Heuristic #4 - Consistency and Standards",
  },
  "wcag-contrast": {
    severity: "Critical",
    category: "Accessibility",
    frameworkViolation: "WCAG 2.2 SC 1.4.3",
  },
  "brand-font": {
    severity: "Low",
    category: "Consistency",
    frameworkViolation: "Nielsen Heuristic #4 - Consistency and Standards",
  },
  "shape-language": {
    severity: "Medium",
    category: "Consistency",
    frameworkViolation: "Nielsen Heuristic #4 - Consistency and Standards",
  },
  "form-label": {
    severity: "Critical",
    category: "Forms",
    frameworkViolation: "Nielsen Heuristic #6 - Recognition vs. Recall",
  },
  "mobile-overflow": {
    severity: "Critical",
    category: "Ergonomics",
    frameworkViolation: "WCAG 2.2 SC 1.4.10 - Reflow",
  },
  "link-affordance": {
    severity: "High",
    category: "Accessibility",
    frameworkViolation: "WCAG 2.2 SC 1.4.1",
  },
};

export function viewportProfile(width) {
  if (width < 768) return { name: "mobile", width, minTouch: QUALITY_MODEL.touchTargets.mobile };
  if (width <= 1024) return { name: "tablet", width, minTouch: QUALITY_MODEL.touchTargets.tablet };
  return { name: "desktop", width, minTouch: QUALITY_MODEL.touchTargets.desktop };
}

/**
 * Create a skill-schema issue (+ optional css_patch for remediation).
 */
export function issue({
  severity,
  category,
  frameworkViolation,
  selector,
  problem,
  whyItIsWrong,
  fixInstruction,
  impact,
  css_patch,
  rule,
  viewport,
}) {
  const meta = rule ? RULE_META[rule] : null;
  return {
    severity: severity || meta?.severity || "Medium",
    category: category || meta?.category || "Ergonomics",
    frameworkViolation: frameworkViolation || meta?.frameworkViolation || "UI/UX quality model",
    selector,
    problem,
    whyItIsWrong,
    fixInstruction,
    impact,
    ...(css_patch ? { css_patch } : {}),
    ...(rule ? { rule } : {}),
    ...(viewport ? { viewport } : {}),
  };
}

function parsePx(raw) {
  if (!raw || raw === "auto" || raw === "none") return null;
  if (!String(raw).endsWith("px")) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function parseRgb(color) {
  if (!color) return null;
  const m = String(color).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/i);
  if (!m) return null;
  return {
    rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
    alpha: m[4] === undefined ? 1 : Number(m[4]),
  };
}

export function contrastRatio(fg, bg) {
  const a = parseRgb(fg);
  const b = parseRgb(bg);
  if (!a || !b || a.alpha < 0.85) return null;
  const L1 = relativeLuminance(a.rgb);
  const L2 = relativeLuminance(b.rgb);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function roundToGrid(px) {
  const step = QUALITY_MODEL.spacingDivisorPx;
  return `${Math.max(step, Math.round(px / step) * step)}px`;
}

function camelToKebab(s) {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function boxGap(a, b) {
  if (!a || !b) return null;
  const dx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)));
  if (dx === 0 && dy === 0) return 0;
  if (dx === 0) return dy;
  if (dy === 0) return dx;
  return Math.hypot(dx, dy);
}

function withCssFix(text, css_patch) {
  if (!css_patch?.property) return text;
  return `${text} Apply CSS: ${css_patch.property}: ${css_patch.value};`;
}

const SPACING_KEYS = [
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "marginTop", "marginRight", "marginBottom", "marginLeft",
  "gap", "rowGap", "columnGap", "top", "right", "bottom", "left",
];

export function auditSnapshot({ nodes, meta, viewport }) {
  const issues = [];
  const profile = viewportProfile(viewport.width);
  const seen = new Set();

  const push = (item) => {
    const key = `${item.selector}|${item.css_patch?.property || item.fixInstruction}|${item.problem}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ ...item, viewport: profile.name });
  };

  // Spacing: divisible by 4 or 8
  for (const node of nodes) {
    for (const key of SPACING_KEYS) {
      const raw = node.styles[key];
      const px = parsePx(raw);
      if (px === null || px === 0) continue;
      const ok = px % 4 === 0 || px % 8 === 0;
      if (!ok) {
        const fixed = roundToGrid(px);
        const css_patch = { property: camelToKebab(key), value: fixed };
        push(
          issue({
            rule: "spacing-scale",
            selector: node.selector,
            problem: `Spacing ${key} is ${raw}, which is not on the 4/8px scale.`,
            whyItIsWrong: "Uneven spacing breaks the visual grid and makes the UI feel inconsistent.",
            fixInstruction: withCssFix(`Snap ${key} to the nearest 4px/8px value (e.g. ${fixed}).`, css_patch),
            impact: "The layout will look more consistent and professional across breakpoints.",
            css_patch,
          })
        );
      }
    }
  }

  // Touch targets
  for (const node of nodes.filter((n) => n.interactive)) {
    const w = parsePx(node.styles.width) ?? node.box?.width ?? 0;
    const h = parsePx(node.styles.height) ?? node.box?.height ?? 0;
    const min = profile.minTouch;
    if (w > 0 && h > 0 && (w < min || h < min)) {
      const css_patch = { property: "min-height", value: `${min}px` };
      push(
        issue({
          rule: "touch-target",
          selector: node.selector,
          problem: `Control is about ${Math.round(w)}×${Math.round(h)}px — below the ${min}px minimum for ${profile.name}.`,
          whyItIsWrong: "Small hit areas cause missed taps/clicks (Fitts's Law / WCAG 2.2 SC 2.5.8).",
          fixInstruction: withCssFix(`Increase min-width and min-height to at least ${min}px.`, css_patch),
          impact: "Users will hit the intended control more reliably, reducing errors and rage-clicks.",
          css_patch,
        })
      );
    }
  }

  // Proximity (mobile/tablet)
  if (profile.name !== "desktop") {
    const interactives = nodes.filter((n) => n.interactive && n.box);
    for (let i = 0; i < interactives.length; i++) {
      for (let j = i + 1; j < interactives.length; j++) {
        const a = interactives[i];
        const b = interactives[j];
        const dist = boxGap(a.box, b.box);
        if (dist !== null && dist < 8) {
          const css_patch = { property: "gap", value: "8px" };
          push(
            issue({
              rule: "target-proximity",
              selector: a.selector,
              problem: `Interactive elements are only ~${Math.round(dist)}px apart on ${profile.name}.`,
              whyItIsWrong: "Controls placed too close cause accidental taps (Fitts's Law / clutter).",
              fixInstruction: withCssFix("Add at least 8px spacing between interactive hit areas.", css_patch),
              impact: "Fewer accidental taps and higher task success on mobile.",
              css_patch,
            })
          );
        }
      }
    }
  }

  // Typography
  const sizes = { h1: [], h2: [], h3: [], p: [] };
  for (const node of nodes) {
    const tag = node.tag;
    const fontSize = parsePx(node.styles.fontSize);
    if (!fontSize) continue;
    if (sizes[tag]) sizes[tag].push(fontSize);

    if (tag === "p" || node.role === "body-text") {
      const minBody = profile.name === "desktop" ? QUALITY_MODEL.typography.minBodyDesktopPx : QUALITY_MODEL.typography.minBodyMobilePx;
      if (fontSize < minBody) {
        const css_patch = { property: "font-size", value: `${minBody}px` };
        push(
          issue({
            rule: "body-type-size",
            selector: node.selector,
            problem: `Body text is ${fontSize}px, under the ${minBody}px minimum for ${profile.name}.`,
            whyItIsWrong: "Text that is too small reduces readability and accessibility.",
            fixInstruction: withCssFix(`Increase font-size to at least ${minBody}px.`, css_patch),
            impact: "Content becomes easier to read, especially on phones.",
            css_patch,
          })
        );
      }
    }

    const lh = parsePx(node.styles.lineHeight);
    if (fontSize && lh && (tag === "p" || tag === "li")) {
      const ratio = lh / fontSize;
      if (ratio < 1.35) {
        const css_patch = { property: "line-height", value: "1.5" };
        push(
          issue({
            rule: "line-height",
            selector: node.selector,
            problem: `Line height is ~${ratio.toFixed(2)}× font size; aim for ~1.5×.`,
            whyItIsWrong: "Tight leading makes paragraphs harder to scan.",
            fixInstruction: withCssFix("Set line-height to 1.5.", css_patch),
            impact: "Longer copy becomes more comfortable to read.",
            css_patch,
          })
        );
      }
    }
  }

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const h1 = avg(sizes.h1);
  const h2 = avg(sizes.h2);
  const h3 = avg(sizes.h3);
  if (h1 && h2 && h1 <= h2) {
    const css_patch = { property: "font-size", value: `${Math.ceil(h2 * 1.25)}px` };
    push(
      issue({
        rule: "type-hierarchy",
        selector: "h1",
        problem: `H1 (~${h1.toFixed(0)}px) is not larger than H2 (~${h2.toFixed(0)}px).`,
        whyItIsWrong: "Broken heading hierarchy confuses scanning and visual priority (Nielsen #4).",
        fixInstruction: withCssFix("Make H1 clearly larger than H2.", css_patch),
        impact: "Users will identify the page title instantly.",
        css_patch,
      })
    );
  }
  if (h2 && h3 && h2 <= h3) {
    const css_patch = { property: "font-size", value: `${Math.ceil(h3 * 1.15)}px` };
    push(
      issue({
        rule: "type-hierarchy",
        selector: "h2",
        problem: `H2 (~${h2.toFixed(0)}px) is not larger than H3 (~${h3.toFixed(0)}px).`,
        whyItIsWrong: "Section structure becomes unclear while scanning.",
        fixInstruction: withCssFix("Make H2 larger than H3.", css_patch),
        impact: "Clearer section structure and faster comprehension.",
        css_patch,
      })
    );
  }

  // Contrast
  for (const node of nodes.filter((n) => ["p", "h1", "h2", "h3", "h4", "span", "a", "button", "label", "li"].includes(n.tag))) {
    const ratio = contrastRatio(node.styles.color, node.styles.effectiveBackground || node.styles.backgroundColor);
    if (ratio === null) continue;
    const fontSize = parsePx(node.styles.fontSize) || 16;
    const weight = Number(node.styles.fontWeight) || 400;
    const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
    const need = large ? QUALITY_MODEL.wcag.largeContrast : QUALITY_MODEL.wcag.normalContrast;
    if (ratio < need) {
      const css_patch = {
        property: "color",
        value: QUALITY_MODEL.brand.enforce_colors ? QUALITY_MODEL.brand.primary : "#111827",
      };
      push(
        issue({
          rule: "wcag-contrast",
          selector: node.selector,
          problem: `Text contrast is about ${ratio.toFixed(2)}:1 (needs ≥ ${need}:1).`,
          whyItIsWrong: "Low contrast fails WCAG 2.2 SC 1.4.3 and excludes users with low vision.",
          fixInstruction: withCssFix(`Increase contrast to at least ${need}:1.`, css_patch),
          impact: "Text becomes readable for more users and passes accessibility checks.",
          css_patch,
        })
      );
    }
  }

  if (QUALITY_MODEL.brand.enforce_fonts && QUALITY_MODEL.brand.fonts?.length && meta?.fontFamily) {
    const fam = meta.fontFamily.toLowerCase();
    const ok = QUALITY_MODEL.brand.fonts.some((f) => fam.includes(String(f).toLowerCase()));
    if (!ok) {
      const stack = QUALITY_MODEL.brand.fonts.join(", ");
      const css_patch = { property: "font-family", value: stack };
      push(
        issue({
          rule: "brand-font",
          selector: "body",
          problem: `Page font "${meta.fontFamily}" is outside the injected brand allowlist.`,
          whyItIsWrong: "Off-brand typography breaks consistency with the design system (Nielsen #4).",
          fixInstruction: withCssFix(`Use the brand font stack: ${stack}.`, css_patch),
          impact: "The product will feel on-brand and consistent.",
          css_patch,
        })
      );
    }
  }

  const radii = nodes.map((n) => parsePx(n.styles.borderRadius)).filter((n) => n !== null && n > 0);
  const hasPill = radii.some((r) => r >= 999 || r >= 40);
  const hasSharpCard = nodes.some((n) => (n.className || "").includes("card") && parsePx(n.styles.borderRadius) === 0);
  if (hasPill && hasSharpCard) {
    const css_patch = { property: "border-radius", value: "12px" };
    push(
      issue({
        rule: "shape-language",
        selector: ".card",
        problem: "Buttons use pill rounding while cards are sharply squared.",
        whyItIsWrong: "Inconsistent shape language violates visual standards (Nielsen #4).",
        fixInstruction: withCssFix("Align card border-radius with the button radius system.", css_patch),
        impact: "UI components feel like one coherent design system.",
        css_patch,
      })
    );
  }

  for (const node of nodes.filter((n) => n.tag === "input" || n.tag === "textarea")) {
    if (node.hasPlaceholder && !node.hasLabel) {
      push(
        issue({
          rule: "form-label",
          selector: node.selector,
          problem: "This field only uses placeholder text — no persistent visible label.",
          whyItIsWrong: "Placeholders disappear on focus — users must recall the field purpose (Nielsen #6).",
          fixInstruction: "Add a permanent <label for=\"...\"> associated with this input. Do not rely on placeholder alone.",
          impact: "Users keep context while typing and submit fewer incorrect forms.",
        })
      );
    }
  }

  if (profile.name === "mobile" && meta?.hasHorizontalOverflow) {
    const css_patch = { property: "overflow-x", value: "hidden" };
    push(
      issue({
        rule: "mobile-overflow",
        selector: "body",
        problem: "The page scrolls sideways on mobile — content overflows the viewport.",
        whyItIsWrong: "Fails WCAG 2.2 SC 1.4.10 Reflow; mobile users miss content.",
        fixInstruction: withCssFix("Fix overflowing children; use max-width: 100%, flex-wrap, or constrain containers.", css_patch),
        impact: "The page reflows cleanly on small screens without horizontal scrolling.",
        css_patch,
      })
    );
  }

  for (const node of nodes.filter((n) => n.tag === "a" && n.isInlineLink)) {
    const undecorated = !node.styles.textDecorationLine || node.styles.textDecorationLine === "none";
    if (undecorated) {
      const css_patch = { property: "text-decoration", value: "underline" };
      push(
        issue({
          rule: "link-affordance",
          selector: node.selector,
          problem: "This link is distinguished by color only — no underline or other non-color cue.",
          whyItIsWrong: "Color-only links fail users who cannot perceive color differences (WCAG).",
          fixInstruction: withCssFix("Add an underline or another non-color affordance.", css_patch),
          impact: "Links are recognizable without relying on color vision.",
          css_patch,
        })
      );
    }
  }

  return issues;
}

export function axeToIssues(violations) {
  const impactMap = {
    critical: "Critical",
    serious: "High",
    moderate: "Medium",
    minor: "Low",
  };
  const issues = [];
  for (const v of violations) {
    for (const node of v.nodes.slice(0, 8)) {
      const selector = Array.isArray(node.target) ? node.target.join(" ") : String(node.target || "unknown");
      const css_patch = suggestAxePatch(v.id);
      issues.push(
        issue({
          severity: impactMap[v.impact] || "Medium",
          category: "Accessibility",
          frameworkViolation: `axe-core / WCAG (${v.id})`,
          selector,
          problem: v.help || v.description || v.id,
          whyItIsWrong: node.failureSummary || v.description || "Accessibility barrier for some users.",
          fixInstruction: withCssFix(`${v.help}. See ${v.helpUrl || "https://www.w3.org/WAI/WCAG22/quickref/"}`, css_patch),
          impact: "Fixing this improves accessibility compliance and reduces exclusion risk.",
          css_patch,
          rule: `axe:${v.id}`,
        })
      );
    }
  }
  return issues;
}

function suggestAxePatch(id) {
  const contrastColor = QUALITY_MODEL.brand.enforce_colors ? QUALITY_MODEL.brand.primary : "#111827";
  const map = {
    "color-contrast": { property: "color", value: contrastColor },
    "button-name": { property: "aria-label", value: "Describe this button" },
    "link-name": { property: "aria-label", value: "Describe this link" },
    "image-alt": { property: "alt", value: "Describe the image" },
    "target-size": { property: "min-height", value: "24px" },
  };
  return map[id] || null;
}

export function sortIssuesBySeverity(issues) {
  return [...issues].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
}

export function toPublicIssue(i) {
  return {
    severity: i.severity,
    category: i.category,
    frameworkViolation: i.frameworkViolation,
    selector: i.selector,
    problem: i.problem,
    whyItIsWrong: i.whyItIsWrong,
    fixInstruction: i.fixInstruction,
    impact: i.impact,
    ...(i.elementScreenshot ? { elementScreenshot: i.elementScreenshot } : {}),
  };
}

export function buildSkillPayload(rawIssues) {
  const sorted = sortIssuesBySeverity(rawIssues);
  const publicIssues = sorted.map(toPublicIssue);
  const criticalFires = publicIssues.filter((i) => i.severity === "Critical").length;
  const high = publicIssues.filter((i) => i.severity === "High").length;
  const categories = [...new Set(publicIssues.map((i) => i.category))];

  let overallHealth = "Good";
  if (criticalFires > 0 || publicIssues.length > 40) overallHealth = "Poor";
  else if (high > 0 || publicIssues.length > 15) overallHealth = "Fair";

  const top = publicIssues[0];
  const topRecommendation = top
    ? `Prioritize ${top.category.toLowerCase()}: ${top.problem}`
    : "No major UI/UX issues detected on this screen.";

  return {
    executiveSummary: {
      overallHealth,
      criticalFires,
      topRecommendation,
    },
    availableCategories: categories,
    issues: publicIssues,
  };
}

export function scoreIssues(issues) {
  const weights = { Critical: 12, High: 6, Medium: 3, Low: 1 };
  let raw = 0;
  for (const i of issues) raw += weights[i.severity] || 3;
  const severityPenalty = 10 * Math.log2(1 + raw / 10);
  const volumePenalty = 18 * Math.log10(1 + issues.length);
  const penalty = Math.min(90, Math.round(severityPenalty + volumePenalty));
  return Math.max(0, 100 - penalty);
}
