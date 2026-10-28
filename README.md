# UI/UX audit harness

A TypeScript CLI that opens a local demo screen, saves a screenshot and DOM evidence, and runs axe-core plus spacing, type, and heading checks. It writes JSON and HTML, can re-audit after a human-approved fix manifest, and exits 0 or 1 from a score gate.

The pipeline is linear: capture, check, merge, report, optional inject, re-check, gate. There is no agent orchestrator.

## Layout

- `demo-app/` — Vite + React screens with seeded issues
- `audit-harness/` — CLI, quality model, fixtures, and approved fix manifests
- `runs/` — gitignored artifacts (`report.json`, `report.html`, screenshots, `gate-decision.json`)

## Setup

```bash
pnpm install
pnpm exec playwright install chromium
```

## Demo

Terminal A:

```bash
pnpm demo
```

Terminal B:

```bash
pnpm audit:gate -- --url http://localhost:5173/broken-checkout
pnpm eval:fixtures
pnpm audit:gate -- --url http://localhost:5173/broken-checkout --fix audit-harness/fixes/broken-checkout.json
```

Open `runs/<id>/report.html` for the findings, screenshot, and proposed fixes. Nothing in the demo app is edited unless you change it yourself. `--fix` injects a manifest you already wrote.

Before/after:

```bash
pnpm run audit -- --url http://localhost:5173/broken-checkout
pnpm run audit -- --url http://localhost:5173/broken-checkout --fix audit-harness/fixes/broken-checkout.json --before "$(cat runs/latest.txt)"
```

The second run writes `verification.json`, a pixel diff, and side-by-side images in the HTML report.

`pnpm verify` starts the demo, runs the unit tests, checks fail/fix/pass on every seeded screen, and runs fixture recall.

## Screens

| Route | Seeded issue | Approved fix |
| --- | --- | --- |
| `/broken-checkout` | Low-contrast Pay button, unlabeled card field, 13px note | `audit-harness/fixes/broken-checkout.json` |
| `/broken-dashboard` | 7px and 15px spacing, unlabeled icon button, two h1s | `audit-harness/fixes/broken-dashboard.json` |
| `/good-landing` | Clean screen. The gate must stay green | none |
| `/new-feature` | Unlabeled invite email. Gate fails, then passes after the fix | `audit-harness/fixes/new-feature.json` |

`/new-feature` is the bonus screen: same capture, same gate, one intentional `label` failure.

## Commands

```bash
pnpm audit:capture -- --url http://localhost:5173/broken-checkout
pnpm run audit -- --url http://localhost:5173/broken-dashboard
pnpm audit:gate -- --url http://localhost:5173/good-landing
pnpm eval:fixtures
pnpm run audit -- --url http://localhost:5173/broken-dashboard --ollama
pnpm run audit -- --url http://localhost:5173/good-landing --no-heuristic
```

Use `pnpm run audit`. Plain `pnpm audit` is pnpm's vulnerability scan, not this harness.

`pnpm run audit` exits 0 when the pipeline finishes. `audit:gate` exits 1 when the gate fails. `eval:fixtures` exits 1 when recall is under 70% or `/good-landing` is no longer clean.

Tracked hosts are `localhost`, `127.0.0.1`, and `::1`. URLs with credentials are rejected.

## Gate

Score starts at 100. Critical costs 10, serious 5, moderate 2, minor 1. Pass requires score ≥ 80 and zero critical findings. DOM heuristics count. Ollama notes are low confidence and do not count. If Ollama is not running, `--ollama` records a skip and the rest of the audit still finishes.

Details live in `docs/quality-model.md` and `audit-harness/config/quality-model.json`.

## Limits

The gate is not a WCAG certification and not a user test. Spacing is checked only on `data-audit-spacing` containers so browser default margins are not treated as design-system bugs. Fix manifests can inject CSS, set a small allowlist of attributes, insert text nodes, or retag a heading. They cannot run page scripts. A person has to choose the manifest.
