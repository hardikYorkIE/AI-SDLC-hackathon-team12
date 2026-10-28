# AI-SDLC Hackathon Team 12

**Problem 01:** UI/UX audit harness for a vibe-coded product

Audit a live vibe-coded screen (`index.html`) against **`audit_skill_file.md`**, emit the required `issues[]` JSON, **apply CSS patches**, re-audit, and show a **before/after** report. Bonus: CI gate on audit score.

Quality model source of truth: [`audit_skill_file.md`](./audit_skill_file.md)

## Setup

```bash
npm install
npx playwright install chromium
```

## Run (before → remediate → after → report)

Terminal 1 — serve the fixture:

```bash
npm run serve
```

Terminal 2:

```bash
# 1) Before audit (screenshots + issues.json)
npm run audit -- --url=http://127.0.0.1:8765

# 2) Build patch.css from issues[].css_patch
npm run remediate

# 3) Inject patches, capture after, re-score
npm run audit-after -- --url=http://127.0.0.1:8765

# 4) Open before/after slider report
npm run report
```

Or one shot:

```bash
npm run audit:full -- --url=http://127.0.0.1:8765
npm run report
```

CI gate (bonus):

```bash
npm run audit-gate -- --url=http://127.0.0.1:8765 --threshold=90
```

## Why `--` matters

```bash
# wrong — npm eats --url
npm run audit --url=http://127.0.0.1:8765

# correct
npm run audit -- --url=http://127.0.0.1:8765
```

## Artifacts

| File | Meaning |
|---|---|
| `artifacts/latest/before.png` | Desktop before |
| `artifacts/latest/after.png` | Desktop after patches |
| `artifacts/latest/issues.json` | Before findings (skill JSON shape) |
| `artifacts/latest/issues-after.json` | Remaining findings after patch |
| `artifacts/latest/patch.css` | Injected remediation CSS |
| `artifacts/latest/report.html` | Before/after visual report |

## Open source

- [Playwright](https://github.com/microsoft/playwright) — ingest / screenshots
- [@axe-core/playwright](https://github.com/dequelabs/axe-core-npm) — WCAG checks
