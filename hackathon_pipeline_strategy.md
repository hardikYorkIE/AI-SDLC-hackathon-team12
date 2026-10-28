# 🎨 UI/UX Audit Harness for Vibe-Coded Products

**Team:** AI-SDLC-hackathon-[team-name]  
**Problem Statement:** 01 - UI/UX audit harness for a vibe-coded product  

---

## 📖 Overview

"Vibe-coded" products (rapidly generated via prompts or ad-hoc styling) often suffer from visual inconsistencies, broken layouts, and accessibility failures. Our solution is an automated pipeline that:
1. **Audits** live screens against an objective UI/UX quality model.
2. **Flags & Patches** specific issues (contrast, spacing, typography, alignment).
3. **Demonstrates** the fix via a Before/After comparison.
4. **Gates** deployments by ensuring new screens pass the same audit threshold.

---

## 🔬 Core Evaluation Methodologies

To ensure our findings are highly objective and scientific, our audit engine is anchored in industry-standard human factors frameworks:

* **WCAG 2.2 (Accessibility):** Deterministic evaluation of color contrast (SC 1.4.3), touch target sizes (SC 2.5.8), and ARIA labels.
* **8-Point Spatial Grid:** Audits computed DOM styles (padding, margin, gap) to ensure spacing values are modular (`value % 4 == 0` or `value % 8 == 0`).
* **Modular Typographic Scale:** Evaluates the mathematical ratio between header tags (`H1` -> `Body`) to ensure monotonic decreasing hierarchy.
* **Nielsen’s 10 Usability Heuristics:** Evaluates design token consistency and error prevention heuristics (Heuristic #4).

---

## ⚙️ End-to-End Pipeline Architecture

```text
[Target Screen / URL]
        │
        ▼
[1. Ingestion Engine] (Playwright: DOM, CSS computed styles, Full-page Screenshot)
        │
        ▼
[2. Dual-Track Audit Engine]
   ├── Track A (Deterministic): Axe-core (WCAG AA), 8pt Spacing Linter, Font Scale Linter
   └── Track B (Heuristic / LLM): Vision model evaluating visual hierarchy, clutter & Nielsen rules
        │
        ▼
[3. Remediation & Patch Engine] (Generates CSS/DOM patch + JSON audit findings)
        │
        ▼
[4. Live Injection / Verification] (Applies patch in headless browser, re-audits screen)
        │
        ▼
[5. Gate & Presentation] (Pass/Fail threshold check + Before/After visual diff UI)
```

---

## 🛠️ Implementation Stages

### Stage 1: Ingestion & Deterministic Audit
* **Tech Stack:** Node.js, Playwright, `@axe-core/playwright`.
* **Action:** Launch the target web app headlessly, capture full-page screenshots, extract the DOM tree, and run deterministic WCAG and layout linters.

### Stage 2: Heuristic LLM Evaluation
* **Tech Stack:** Multimodal LLM (e.g., Claude 3.5 Sonnet / GPT-4o).
* **Action:** Pass screenshot pairs and extracted styles to the LLM to evaluate visual balance and spacing friction, outputting a strict JSON schema of CSS selectors and suggested fixes.

### Stage 3: Remediation & Injection
* **Action:** Parse the JSON findings into actionable CSS/HTML patch suggestions. Inject the generated CSS overrides into the live page via Playwright to render the "After" version.

### Stage 4: Quality Gate & Visualizer
* **Action:** A Next.js/Vite dashboard displaying a side-by-side (or slider) comparison of the "Vibe-Coded" vs. "Audited & Patched" screens.
* **Bonus:** A CLI tool (`npm run audit-gate`) that blocks CI/CD deployments if a newly added screen fails to meet the minimum Audit Score.

---

## 🧑‍💻 Team Division of Labor

| Role | Responsibilities | Deliverables |
| :--- | :--- | :--- |
| **Dev 1 (Pipeline Lead)** | Headless browser setup, DOM/screenshot scraper, CLI/CI runner. | Playwright harness that ingests URLs, captures state, and runs the CLI gate (Bonus). |
| **Dev 2 (Audit & AI Lead)** | Deterministic rules (`axe-core`, token parsers) + LLM prompt engineering. | Audit engine outputting structured JSON with issue type, severity, and exact CSS patch. |
| **Dev 3 (Frontend Lead)** | Before-and-after visual interface, UI dashboard. | Clean visual diff slider showing the audited screen with overlays and pass/fail metrics. |

---

## 🚀 Quick Start (Draft)

```bash
# 1. Install dependencies
npm install

# 2. Run the audit against a target URL
npm run audit --url=http://localhost:3000/vibe-coded-screen

# 3. View the Before/After report
npm run report

# 4. Run as a CI Quality Gate
npm run audit-gate --url=http://localhost:3000/new-feature --threshold=90
```