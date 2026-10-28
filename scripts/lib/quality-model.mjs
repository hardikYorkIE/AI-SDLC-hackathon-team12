/**
 * Quality model from audit_skill_file.md
 * Deterministic rules + helpers for the required issues[] JSON shape.
 */

export const QUALITY_MODEL = {
  source: "audit_skill_file.md",
  breakpoints: {
    mobile: { max: 767, label: "mobile" },
    tablet: { min: 768, max: 1024, label: "tablet" },
    desktop: { min: 1025, label: "desktop" },
  },
  spacingBasePx: 4,
  touchTargets: {
    mobile: 48,
    tablet: 48,
    desktop: 32,
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
    fonts: ["inter", "system-ui", "sans-serif"],
  },
  wcag: {
    normalContrast: 4.5,
    largeContrast: 3.0,
  },
};

export function issue({
  selector,
  what_is_wrong,
  why_it_matters,
  layman_fix,
  developer_instruction,
  css_patch,
  rule,
  viewport,
}) {
  return {
    selector,
    what_is_wrong,
    why_it_matters,
    layman_fix,
    developer_instruction,
    css_patch,
    ...(rule ? { rule } : {}),
    ...(viewport ? { viewport } : {}),
  };
}

export function viewportProfile(width) {
  if (width < 768) return { name: "mobile", width, minTouch: QUALITY_MODEL.touchTargets.mobile };
  if (width <= 1024) return { name: "tablet", width, minTouch: QUALITY_MODEL.touchTargets.tablet };
  return { name: "desktop", width, minTouch: QUALITY_MODEL.touchTargets.desktop };
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
  return `${Math.max(QUALITY_MODEL.spacingBasePx, Math.round(px / QUALITY_MODEL.spacingBasePx) * QUALITY_MODEL.spacingBasePx)}px`;
}

const SPACING_KEYS = [
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "gap",
  "rowGap",
  "columnGap",
  "top",
  "right",
  "bottom",
  "left",
];

/**
 * Run all deterministic checks from audit_skill_file.md section 1 + heuristics that can be computed from DOM.
 */
export function auditSnapshot({ nodes, meta, viewport }) {
  const issues = [];
  const profile = viewportProfile(viewport.width);
  const seen = new Set();

  const push = (item) => {
    const key = `${item.selector}|${item.css_patch?.property}|${item.what_is_wrong}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ ...item, viewport: profile.name });
  };

  // --- Spacing scale (divisible by 4) ---
  for (const node of nodes) {
    for (const key of SPACING_KEYS) {
      const raw = node.styles[key];
      const px = parsePx(raw);
      if (px === null || px === 0) continue;
      if (px % QUALITY_MODEL.spacingBasePx !== 0) {
        const fixed = roundToGrid(px);
        push(
          issue({
            selector: node.selector,
            rule: "spacing-scale",
            what_is_wrong: `Spacing ${key} is ${raw}, which is not on the 4px design scale.`,
            why_it_matters: "Uneven spacing makes the layout feel messy and inconsistent across screens.",
            layman_fix: "Snap this spacing to the nearest multiple of 4 pixels.",
            developer_instruction: `Set ${key} to a 4px-grid value (e.g. ${fixed}). audit_skill_file.md requires padding/margin/gap/position values divisible by 4.`,
            css_patch: { property: camelToKebab(key), value: fixed },
          })
        );
      }
    }
  }

  // --- Touch targets ---
  for (const node of nodes.filter((n) => n.interactive)) {
    const w = parsePx(node.styles.width) ?? node.box?.width ?? 0;
    const h = parsePx(node.styles.height) ?? node.box?.height ?? 0;
    const min = profile.minTouch;
    if (w > 0 && h > 0 && (w < min || h < min)) {
      push(
        issue({
          selector: node.selector,
          rule: "touch-target",
          what_is_wrong: `Interactive control is about ${Math.round(w)}×${Math.round(h)}px, below the ${min}px minimum for ${profile.name}.`,
          why_it_matters: "Users may miss the tap/click or hit a nearby control by mistake.",
          layman_fix: "Make the clickable area larger so it is easier to press.",
          developer_instruction: `Increase min-width/min-height to at least ${min}px for ${profile.name} (audit_skill_file.md platform touch targets).`,
          css_patch: { property: "min-height", value: `${min}px` },
        })
      );
    }
  }

  // --- Target proximity on mobile/tablet (>= 8px) ---
  if (profile.name !== "desktop") {
    const interactives = nodes.filter((n) => n.interactive && n.box);
    for (let i = 0; i < interactives.length; i++) {
      for (let j = i + 1; j < interactives.length; j++) {
        const a = interactives[i];
        const b = interactives[j];
        const dist = boxGap(a.box, b.box);
        if (dist !== null && dist < 8) {
          push(
            issue({
              selector: `${a.selector} + ${b.selector}`,
              rule: "target-proximity",
              what_is_wrong: `Two interactive elements are only ~${Math.round(dist)}px apart on ${profile.name}.`,
              why_it_matters: "Fat-finger errors: people may tap both or the wrong one.",
              layman_fix: "Add more space between these buttons/links.",
              developer_instruction: "Ensure at least 8px gap between interactive hit areas on mobile/tablet (audit_skill_file.md §2A).",
              css_patch: { property: "gap", value: "8px" },
            })
          );
        }
      }
    }
  }

  // --- Typography hierarchy + min sizes + line-height ---
  const sizes = { h1: [], h2: [], h3: [], p: [] };
  for (const node of nodes) {
    const tag = node.tag;
    const fontSize = parsePx(node.styles.fontSize);
    if (!fontSize) continue;
    if (sizes[tag]) sizes[tag].push(fontSize);

    if ((tag === "p" || node.role === "body-text") && fontSize) {
      const minBody = profile.name === "desktop" ? QUALITY_MODEL.typography.minBodyDesktopPx : QUALITY_MODEL.typography.minBodyMobilePx;
      if (fontSize < minBody) {
        push(
          issue({
            selector: node.selector,
            rule: "body-type-size",
            what_is_wrong: `Paragraph text is ${fontSize}px, under the ${minBody}px minimum for ${profile.name}.`,
            why_it_matters: "Small text is hard to read, especially on phones.",
            layman_fix: "Increase the body text size.",
            developer_instruction: `Set font-size to at least ${minBody}px on ${profile.name} (audit_skill_file.md typographic hierarchy).`,
            css_patch: { property: "font-size", value: `${minBody}px` },
          })
        );
      }
    }

    const lh = parsePx(node.styles.lineHeight);
    if (fontSize && lh) {
      const ratio = lh / fontSize;
      if (ratio < 1.35 && (tag === "p" || tag === "li")) {
        push(
          issue({
            selector: node.selector,
            rule: "line-height",
            what_is_wrong: `Line height is ~${ratio.toFixed(2)}× font size; target is ~1.5×.`,
            why_it_matters: "Tight lines make longer text tiring to read.",
            layman_fix: "Add more space between lines of text.",
            developer_instruction: "Set line-height to approximately 1.5 (audit_skill_file.md §2B).",
            css_patch: { property: "line-height", value: "1.5" },
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
    push(
      issue({
        selector: "h1",
        rule: "type-hierarchy",
        what_is_wrong: `H1 (~${h1.toFixed(0)}px) is not larger than H2 (~${h2.toFixed(0)}px).`,
        why_it_matters: "Users cannot tell what the main page title is.",
        layman_fix: "Make the main heading clearly bigger than subheadings.",
        developer_instruction: "Ensure H1 > H2 > H3 font sizes (audit_skill_file.md §2B).",
        css_patch: { property: "font-size", value: `${Math.ceil(h2 * 1.25)}px` },
      })
    );
  }
  if (h2 && h3 && h2 <= h3) {
    push(
      issue({
        selector: "h2",
        rule: "type-hierarchy",
        what_is_wrong: `H2 (~${h2.toFixed(0)}px) is not larger than H3 (~${h3.toFixed(0)}px).`,
        why_it_matters: "Section structure becomes unclear while scanning.",
        layman_fix: "Make section titles bigger than smaller headings.",
        developer_instruction: "Ensure H2 > H3 font sizes (audit_skill_file.md §2B).",
        css_patch: { property: "font-size", value: `${Math.ceil(h3 * 1.15)}px` },
      })
    );
  }

  // --- WCAG contrast (approx from computed rgb) ---
  for (const node of nodes.filter((n) => ["p", "h1", "h2", "h3", "h4", "span", "a", "button", "label", "li"].includes(n.tag))) {
    const ratio = contrastRatio(node.styles.color, node.styles.effectiveBackground || node.styles.backgroundColor);
    if (ratio === null) continue;
    const fontSize = parsePx(node.styles.fontSize) || 16;
    const weight = Number(node.styles.fontWeight) || 400;
    const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
    const need = large ? QUALITY_MODEL.wcag.largeContrast : QUALITY_MODEL.wcag.normalContrast;
    if (ratio < need) {
      push(
        issue({
          selector: node.selector,
          rule: "wcag-contrast",
          what_is_wrong: `Text contrast is about ${ratio.toFixed(2)}:1 (needs ≥ ${need}:1).`,
          why_it_matters: "Low contrast text is hard to read for many users and fails WCAG 2.2 AA.",
          layman_fix: "Darken the text or lighten the background so the words stand out more.",
          developer_instruction: `Increase contrast to ≥ ${need}:1 for ${large ? "large" : "normal"} text (audit_skill_file.md WCAG 2.2 AA).`,
          css_patch: { property: "color", value: QUALITY_MODEL.brand.primary },
        })
      );
    }
  }

  // --- Brand fonts ---
  if (meta?.fontFamily) {
    const fam = meta.fontFamily.toLowerCase();
    const ok = QUALITY_MODEL.brand.fonts.some((f) => fam.includes(f));
    if (!ok) {
      push(
        issue({
          selector: "body",
          rule: "brand-font",
          what_is_wrong: `Page font "${meta.fontFamily}" is outside the allowed brand stack.`,
          why_it_matters: "Off-brand fonts make the product look inconsistent.",
          layman_fix: "Switch to the approved brand font family.",
          developer_instruction: 'Use font-family: Inter, system-ui, sans-serif (audit_skill_file.md brand variables).',
          css_patch: { property: "font-family", value: "Inter, system-ui, sans-serif" },
        })
      );
    }
  }

  // --- Shape language consistency (border-radius variance) ---
  const radii = nodes
    .map((n) => parsePx(n.styles.borderRadius))
    .filter((n) => n !== null && n > 0);
  const hasPill = radii.some((r) => r >= 999 || r >= 40);
  const hasSharpCard = nodes.some((n) => n.tag === "div" && (n.className || "").includes("card") && parsePx(n.styles.borderRadius) === 0);
  if (hasPill && hasSharpCard) {
    push(
      issue({
        selector: ".card",
        rule: "shape-language",
        what_is_wrong: "Buttons use pill rounding while cards are sharply squared.",
        why_it_matters: "Mixed shape language feels unfinished and breaks visual consistency (Nielsen #4).",
        layman_fix: "Use similar corner roundness on related components.",
        developer_instruction: "Align card border-radius with the button radius system (audit_skill_file.md §2C).",
        css_patch: { property: "border-radius", value: "12px" },
      })
    );
  }

  // --- Placeholder-only inputs ---
  for (const node of nodes.filter((n) => n.tag === "input" || n.tag === "textarea")) {
    if (node.hasPlaceholder && !node.hasLabel) {
      push(
        issue({
          selector: node.selector,
          rule: "form-label",
          what_is_wrong: "This field only shows hint text inside the box (placeholder), with no permanent label.",
          why_it_matters: "When someone starts typing, the hint disappears and they may forget what the field is for.",
          layman_fix: "Add a visible label that stays above or beside the field.",
          developer_instruction: "Provide a persistent <label for=...> (audit_skill_file.md §2D). Do not rely only on placeholder.",
          css_patch: { property: "content", value: "/* add visible label in HTML */" },
        })
      );
    }
  }

  // --- Mobile overflow ---
  if (profile.name === "mobile" && meta?.hasHorizontalOverflow) {
    push(
      issue({
        selector: "body",
        rule: "mobile-overflow",
        what_is_wrong: "The page scrolls sideways on mobile — content is wider than the screen.",
        why_it_matters: "Horizontal scrolling on phones feels broken and content can be missed.",
        layman_fix: "Keep everything fitting within the phone width.",
        developer_instruction: "Fix overflowing children; prefer max-width:100% / flex-wrap / overflow-x:hidden on containers (audit_skill_file.md §2A).",
        css_patch: { property: "overflow-x", value: "hidden" },
      })
    );
  }

  // --- Links relying on color alone ---
  for (const node of nodes.filter((n) => n.tag === "a" && n.isInlineLink)) {
    const undecorated = !node.styles.textDecorationLine || node.styles.textDecorationLine === "none";
    if (undecorated) {
      push(
        issue({
          selector: node.selector,
          rule: "link-affordance",
          what_is_wrong: "This link is only distinguished by color, with no underline or other non-color cue.",
          why_it_matters: "People who cannot perceive color differences may not recognize it as a link (WCAG).",
          layman_fix: "Underline links or add another clear visual cue.",
          developer_instruction: "Add text-decoration: underline (or equivalent non-color affordance) per audit_skill_file.md accessibility rules.",
          css_patch: { property: "text-decoration", value: "underline" },
        })
      );
    }
  }

  return issues;
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

export function axeToIssues(violations) {
  const issues = [];
  for (const v of violations) {
    for (const node of v.nodes.slice(0, 8)) {
      const selector = Array.isArray(node.target) ? node.target.join(" ") : String(node.target || "unknown");
      issues.push(
        issue({
          selector,
          rule: `axe:${v.id}`,
          what_is_wrong: v.help || v.description || v.id,
          why_it_matters: node.failureSummary || v.description || "This accessibility issue can block or confuse users.",
          layman_fix: "Follow the accessibility guidance for this element so everyone can use it.",
          developer_instruction: `${v.help}. See ${v.helpUrl || "https://www.w3.org/WAI/WCAG22/quickref/"}`,
          css_patch: suggestAxePatch(v.id),
        })
      );
    }
  }
  return issues;
}

function suggestAxePatch(id) {
  const map = {
    "color-contrast": { property: "color", value: QUALITY_MODEL.brand.primary },
    "button-name": { property: "aria-label", value: "Describe this button" },
    "link-name": { property: "aria-label", value: "Describe this link" },
    "image-alt": { property: "alt", value: "Describe the image" },
    "target-size": { property: "min-height", value: "32px" },
  };
  return map[id] || { property: "outline", value: "2px solid #10b981" };
}

export function scoreIssues(issues) {
  const weights = {
    "wcag-contrast": 8,
    "touch-target": 6,
    "mobile-overflow": 10,
    "type-hierarchy": 5,
    "spacing-scale": 2,
    "form-label": 6,
    "link-affordance": 4,
    "target-proximity": 5,
    "brand-font": 3,
    "shape-language": 3,
    "line-height": 3,
    "body-type-size": 4,
  };
  let raw = 0;
  for (const i of issues) {
    if (String(i.rule || "").startsWith("axe:")) {
      raw += 8;
    } else {
      raw += weights[i.rule] || 3;
    }
  }
  // Soft log curve + issue-count term so before→after deltas are visible.
  const severityPenalty = 10 * Math.log2(1 + raw / 10);
  const volumePenalty = 18 * Math.log10(1 + issues.length);
  const penalty = Math.min(90, Math.round(severityPenalty + volumePenalty));
  return Math.max(0, 100 - penalty);
}
