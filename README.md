# AI-SDLC Hackathon Team 12

**Problem 01:** UI/UX audit harness for a vibe-coded product

Audit **any website URL** against [`audit_skill_file.md`](./audit_skill_file.md), emit stakeholder/developer `issues[]` JSON, apply CSS patches, re-audit, and show a **before/after** report. Bonus: CI gate on audit score.

Works with local fixtures (`index.html`) **or** any live `http(s)` page.

## Setup

```bash
npm install
npx playwright install chromium
```

## Audit from the browser

```bash
npm run ui
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787). Enter a page URL. If that page requires a login, check the login box and enter the username and password. When the run finishes, use **Open report** on the same page.

Direct report link: [http://127.0.0.1:8787/report](http://127.0.0.1:8787/report)

The form uses only the URL and credentials you type. It does not pick up `.env` or `auth.config.json`.

## Audit any site

```bash
# Local fixture
npm run serve                                          # terminal 1
npm run audit:full -- --url=http://127.0.0.1:8765      # terminal 2
npm run report

# Any other URL
npm run audit:full -- --url=https://example.com
npm run report
```

Step-by-step:

```bash
npm run audit -- --url=<TARGET_URL>
npm run remediate
npm run audit-after -- --url=<TARGET_URL>
npm run report
```

CI gate (bonus):

```bash
npm run audit-gate -- --url=<TARGET_URL> --threshold=90
```

## Authenticated pages

Pass credentials so the audit logs in once and does not stop on the login screen:

```bash
npm run audit:full -- --url=https://app.example.com/dashboard \
  --login-url=https://app.example.com/login \
  --user=you@example.com \
  --password='secret'
```

Or copy `auth.config.example.json` → `auth.config.json` (gitignored) / `.env.example` → `.env`, then:

```bash
npm run audit:full -- --url=https://app.example.com/dashboard --auth=./auth.config.json
```

Reuse a saved session: `--storage-state=artifacts/latest/auth-storage.json`  
Custom form fields: `--auth-user-selector=`, `--auth-pass-selector=`, `--auth-submit-selector=`

## Why `--` matters

```bash
# wrong — npm eats --url
npm run audit --url=https://example.com

# correct
npm run audit -- --url=https://example.com
```

## Skill model (global)

See [`audit_skill_file.md`](./audit_skill_file.md) (aligned to the uploaded skill):

- Spacing divisible by **4 or 8**; touch **48px** mobile / **24px** desktop (WCAG 2.5.8)
- Heuristics A–D: Layout/Ergonomics, Navigation, Forms, Accessibility (Nielsen + Fitts + WCAG)
- Categories: Navigation | Forms | Accessibility | Ergonomics | Typography | Consistency
- Strict JSON: `executiveSummary` + `availableCategories` + severity-sorted `issues[]`
- Before → remediate → after → filterable report with element thumbnails for **any URL**

## Artifacts

Each audit is kept in its own folder. The name is the local time plus the site:

`artifacts/2026-10-28_18-12-43_lawsofux.com/`

`artifacts/latest` is a link to the most recent run. Older runs stay on disk. The form lists them under Past reports.

| File | Meaning |
|---|---|
| `before.png` | Desktop before |
| `after.png` | Desktop after patches |
| `issues.json` | Before findings (skill JSON shape) |
| `issues-after.json` | Remaining findings after patch |
| `patch.css` | Generated remediations |
| `report.html` | Before/after visual report |
| `elements/...` | Per-issue UI element thumbnails (red highlight) |
| `auth-storage.json` | Saved login session (gitignored; cookies only) |

## Open source

- [Playwright](https://github.com/microsoft/playwright) — ingest / screenshots
- [@axe-core/playwright](https://github.com/dequelabs/axe-core-npm) — WCAG checks
