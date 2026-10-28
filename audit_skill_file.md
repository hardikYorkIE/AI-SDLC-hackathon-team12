# 📱 Comprehensive UI/UX Audit Skill & Quality Model

**Global solution:** Audit **any** website URL (local or live), score it against this model, emit the strict JSON below, apply remediations, and produce a before/after report with highlighted element previews.

```bash
npm run audit:full -- --url=<TARGET_URL>
npm run report
```

---

## 1. Automated Design Tokens (Injected per project)

*Note: In a production environment, brand colors and typography are dynamically imported from the client's design tokens (e.g., Tailwind config or Figma). For this audit, the scraper enforces the following baseline:*

* **Base Spacing:** 8px (All padding, margins, and gaps must be divisible by 4 or 8).
* **Touch Targets (Device-Dependent):** Minimum 48x48px for mobile devices; Minimum 24x24px for desktop cursor environments (WCAG 2.2 SC 2.5.8).
* **Contrast:** Minimum 4.5:1 ratio for normal text, 3.0:1 ratio for large text (WCAG 2.2 SC 1.4.3).
* **Brand Colors:** [Dynamically injected project colors].
* **Allowed Fonts:** [Dynamically injected project fonts].

### Responsive viewports (required runs)
| Viewport | Width |
|---|---|
| Mobile | `< 768px` (default 390×844) |
| Tablet | `768px – 1024px` (default 820×1180) |
| Desktop | `> 1024px` (default 1440×900) |

### Optional brand profile (per site)
When omitted, brand color/font allowlists are **not enforced**; universal spacing, touch, contrast, and heuristic rules still apply.

```json
{
  "brand_profile": {
    "colors": {},
    "fonts_allowlist": [],
    "enforce_fonts": false,
    "enforce_colors": false
  }
}
```

---

## 2. Heuristic Rules (For the AI Vision Model)

*The AI will analyze the screenshot and DOM strictly against these industry-standard UX methodologies, adapting to whether the viewport is mobile or desktop:*

### A. Layout & Ergonomics
* **Visual Hierarchy (Nielsen Heuristic #4 - Consistency):** The primary call-to-action (CTA) must be the most prominent element. Flag competing secondary buttons.
* **Clutter & Target Spacing (Fitts's Law):** Identify interactive elements placed too closely together (lacking sufficient gap), causing accidental misclicks.
* **Thumb Zone Reachability (Mobile Ergonomics):** On mobile viewports, critical primary actions should be anchored near the bottom or center. Flag primary CTAs trapped in the top-left corner.
* **Responsiveness (WCAG 2.2 SC 1.4.10 - Reflow):** Ensure multi-column desktop grids collapse gracefully on mobile screens without requiring horizontal scrolling.

### B. Navigation & Wayfinding
* **Visibility of System Status (Nielsen Heuristic #1):** Active navigation tabs, links, or pagination must be visually distinct from inactive ones.
* **User Control & Freedom (Nielsen Heuristic #3):** Modals, overlays, and multi-step flows must have a clear, visible "Cancel", "Back", or "Close" (X) button.

### C. Forms & Data Entry
* **Recognition vs. Recall (Nielsen Heuristic #6):** Form fields must have persistent visible labels (top or left). Flag inputs that rely *only* on disappearing internal placeholders.
* **Error Prevention (Nielsen Heuristic #5):** Destructive actions (e.g., Delete, Remove) must be visually distinct and physically separated from safe actions (e.g., Save, Cancel).
* **Match Between System and Real World (Nielsen Heuristic #2):** Button and link copy should use natural language (e.g., "Save Profile"). Flag robotic or overly technical jargon (e.g., "Execute_Mutation").

### D. Accessibility & Cognitive Load
* **Use of Color (WCAG 2.2 SC 1.4.1):** Information must not be conveyed by color alone. Flag error states (like a red border) that do not also include an error icon or text message.
* **Aesthetic and Minimalist Design (Nielsen Heuristic #8):** Evaluate the signal-to-noise ratio. Flag dense blocks of unbroken text or redundant links that increase cognitive overload.

### Additional computable checks (harness Track A)
* Typographic hierarchy: `H1 > H2 > H3 > body`; body ≥ 14px desktop / ≥ 16px mobile; line-height ≈ 1.5×.
* Contrast via axe / computed styles (WCAG 2.2 SC 1.4.3).
* Spacing divisible by 4 or 8; touch targets per viewport.
* Per-issue **elementScreenshot** (red outline) for report findings.

---

## 3. Strict JSON Output Format

*The AI must evaluate the screen, sort all findings by severity (Critical first, Low last), and return ONLY the following JSON structure.*

```json
{
  "executiveSummary": {
    "overallHealth": "Poor | Fair | Good",
    "criticalFires": "Total number of critical issues that must be fixed immediately.",
    "topRecommendation": "A 1-2 sentence layman summary of the most urgent area needing work."
  },
  "availableCategories": [
    "An array of all unique categories found in the issues list (e.g., 'Navigation', 'Forms', 'Accessibility', 'Ergonomics') so the UI can generate clickable filter tabs."
  ],
  "issues": [
    {
      "severity": "Critical | High | Medium | Low",
      "category": "Navigation | Forms | Accessibility | Ergonomics | Typography | Consistency",
      "frameworkViolation": "The specific methodology violated (e.g., 'WCAG 2.2 SC 1.4.1', 'Nielsen Heuristic #6', 'Fitts's Law')",
      "selector": "The exact CSS selector of the broken element.",
      "problem": "What is wrong (in simple language for laymen).",
      "whyItIsWrong": "Why this violates UX principles or harms the user experience.",
      "fixInstruction": "Exact instructions and CSS properties for the developer to apply.",
      "impact": "What will happen if we make this action (e.g., 'Mobile users will no longer accidentally tap the cancel button, increasing form completion rates')."
    }
  ]
}
```

### Pipeline (any site)
```text
TARGET_URL → Before audit → issues.json (schema above) + element screenshots
           → Remediate (parse fixInstruction → patch.css)
           → After audit → before/after report.html (findings show actual UI thumbnails)
```

### Severity guide
| Severity | When to use |
|---|---|
| Critical | Blocks use / severe a11y (contrast failures on primary UI, broken reflow, missing labels on required fields) |
| High | Touch targets, major hierarchy, serious axe impacts, thumb-zone / crowding |
| Medium | Spacing grid, proximity, consistency, cognitive clutter |
| Low | Soft polish / optional brand drift |

---

## 4. Authenticated pages

To audit pages behind login (so the run does not stop on the login screen), pass credentials at runtime. The harness logs in once, saves a Playwright `storageState`, and reuses it for all viewports. Passwords are **never** written into `issues.json` or the HTML report.

```bash
# CLI
npm run audit:full -- --url=https://app.example.com/dashboard \
  --login-url=https://app.example.com/login \
  --user=you@example.com \
  --password='secret'

# Or config file (copy auth.config.example.json → auth.config.json)
npm run audit:full -- --url=https://app.example.com/dashboard --auth=./auth.config.json

# Or .env (AUDIT_USER / AUDIT_PASSWORD / AUDIT_LOGIN_URL)
npm run audit:full -- --url=https://app.example.com/dashboard

# Reuse a prior session
npm run audit -- --url=https://app.example.com/dashboard \
  --storage-state=artifacts/latest/auth-storage.json
```

Optional: `--auth-user-selector=`, `--auth-pass-selector=`, `--auth-submit-selector=`, `--auth-success-url=/dashboard`.

---

## 5. Non-goals

* Do not commit passwords; use `.env` / `auth.config.json` (gitignored) or CLI flags only.
* Do not bypass CAPTCHA / MFA / SSO that requires human interaction — use a pre-exported `--storage-state=` after a manual login when needed.
* Brand token enforcement requires an injected project profile.
* Deterministic Track A (Playwright + axe + linters) always runs; vision/LLM heuristics are optional enhancements.
