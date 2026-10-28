# UI/UX quality model

This audit compares a screen with a small, explicit model. It is a repeatable check, not a certification and not a usability study.

## What is measured

| Category | Rule | Evidence | Blocks the gate |
| --- | --- | --- | --- |
| Accessibility | axe-core, WCAG 2.0/2.1 A and AA tags | Rule id, selector, HTML snippet, screenshot | Yes, when impact is critical or the score drops below 80 |
| Consistency | Spacing on a 4px step (the 8px grid plus the 4px half-step) for elements marked `data-audit-spacing` | Computed px values | Yes. Severity is serious |
| Consistency | Font size in 12, 14, 16, 20, 24, 32 for elements whose size is set on that element | Computed px | Yes. Severity is serious |
| Visual hierarchy | More than one `h1`, or a heading that skips a level | DOM order and selectors | The finding is moderate. It lowers the score by 2 and does not fail the gate by itself |
| Usability | More than one `.btn-primary` | Selectors | Minor. It does not fail the gate by itself |
| Suggestions | Optional Ollama vision/text note | Screenshot plus a short DOM summary | No. Confidence is low and the score ignores it |

## Gate

`score = 100 - (10×critical + 5×serious + 2×moderate + 1×minor)`

Pass when `score >= 80` and `critical === 0`. Low-confidence findings are listed and omitted from the score.

## What this does not prove

A passing gate does not mean the screen is legally compliant, that people can complete the task, or that the layout is pleasant. Clutter and hierarchy notes are heuristics. Use them as review prompts.
