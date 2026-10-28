import type { ReportFile } from '../types.ts';

const DISCLAIMER =
  'Automated audit is not a legal compliance determination and is not a substitute for usability testing with real users.';

export function renderHtml(report: ReportFile): string {
  const gate = report.run.gate;
  const passed = gate?.pass === true;
  const before = report.verification?.results[0]?.evidence.before;
  const showCompare = Boolean(report.verification);
  const findings = report.findings
    .map(
      (finding) => `<tr>
        <td>${escapeHtml(finding.id)}</td>
        <td>${escapeHtml(finding.severity)}</td>
        <td>${escapeHtml(finding.confidence)}</td>
        <td>${escapeHtml(finding.ruleId)}</td>
        <td>${escapeHtml(finding.title)}</td>
        <td><code>${escapeHtml(finding.selector)}</code></td>
        <td>${escapeHtml(finding.description)}</td>
        <td>${escapeHtml(finding.recommendedAction)}</td>
      </tr>`,
    )
    .join('\n');
  const fixes = report.proposedFixes
    .map(
      (fix) => `<section>
        <h3>${escapeHtml(fix.findingId)} · ${escapeHtml(fix.type)}</h3>
        <p>Requires human approval before it is applied.</p>
        <pre>${escapeHtml(fix.patch)}</pre>
      </section>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Audit ${escapeHtml(report.run.id)}</title>
  <style>
    body { font-family: "Segoe UI", sans-serif; margin: 24px; color: #111827; background: #fff; line-height: 1.45; }
    h1 { font-size: 32px; margin-bottom: 8px; }
    .note { background: #f3f4f6; padding: 12px 16px; border-left: 4px solid #1f2937; }
    .pass { color: #14532d; } .fail { color: #7f1d1d; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0 32px; }
    th, td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; text-align: left; }
    th { background: #f9fafb; }
    code, pre { font-family: ui-monospace, monospace; word-break: break-word; }
    img { max-width: 100%; border: 1px solid #d1d5db; }
    .shots { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
  </style>
</head>
<body>
  <h1>UI audit ${escapeHtml(report.run.id)}</h1>
  <p class="note">${DISCLAIMER}</p>
  <p>Target: ${escapeHtml(report.run.target.url)} · viewport ${report.run.target.viewport.width}×${report.run.target.viewport.height}</p>
  <p class="${passed ? 'pass' : 'fail'}"><strong>${passed ? 'PASS' : 'FAIL'}</strong> · score ${report.run.summary.score} · critical ${report.run.summary.critical} · serious ${report.run.summary.serious} · moderate ${report.run.summary.moderate} · minor ${report.run.summary.minor}</p>
  <p>Low-confidence suggestions are listed and do not change the score. Gate: score ≥ ${gate?.threshold.minScore ?? 80} and critical ≤ ${gate?.threshold.maxCritical ?? 0}.</p>
  ${
    showCompare
      ? `<h2>Before and after</h2>
    <p>Pixel diff: ${report.verification?.pixelDiffPercent ?? 'n/a'}%</p>
    <div class="shots">
      ${before ? `<figure><figcaption>Before</figcaption><img alt="Before screenshot" src="${escapeHtml(before)}" /></figure>` : ''}
      <figure><figcaption>After</figcaption><img alt="After screenshot" src="artifacts/viewport.png" /></figure>
      ${report.verification?.pixelDiffPercent != null ? '<figure><figcaption>Diff</figcaption><img alt="Pixel diff" src="artifacts/diff.png" /></figure>' : ''}
    </div>`
      : `<h2>Screenshot</h2><img alt="Viewport screenshot" src="artifacts/viewport.png" />`
  }
  <h2>Findings</h2>
  ${
    report.findings.length
      ? `<table>
    <thead><tr><th>ID</th><th>Severity</th><th>Confidence</th><th>Rule</th><th>Title</th><th>Selector</th><th>Description</th><th>Action</th></tr></thead>
    <tbody>${findings}</tbody>
  </table>`
      : '<p>No findings. This screen passed the configured checks.</p>'
  }
  <h2>Proposed fixes</h2>
  <p>These are suggestions. The harness applies a change only when you pass a fix manifest you wrote.</p>
  ${fixes || '<p>None.</p>'}
</body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
