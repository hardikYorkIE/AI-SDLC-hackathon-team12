#!/usr/bin/env node
/**
 * Before/After report from audit_skill_file.md findings.
 * Usage: npm run report
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const outDir = path.resolve("artifacts/latest");
const reportJson = path.join(outDir, "audit-report.json");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function main() {
  if (!(await exists(reportJson))) {
    console.error("\n❌ No audit artifacts found. Run this first:\n");
    console.error("   npm run serve");
    console.error("   npm run audit -- --url=http://127.0.0.1:8765");
    console.error("   npm run remediate");
    console.error("   npm run audit-after -- --url=http://127.0.0.1:8765\n");
    process.exit(1);
  }

  const report = JSON.parse(await readFile(reportJson, "utf8"));
  const issues = report.issues || [];
  const hasAfter = Boolean(report.after) && (await exists(path.join(outDir, "after.png")));
  const afterIssues = hasAfter && (await exists(path.join(outDir, "issues-after.json")))
    ? JSON.parse(await readFile(path.join(outDir, "issues-after.json"), "utf8")).issues || []
    : [];

  const beforeScore = report.score;
  const afterScore = report.after?.score;
  const delta = report.after?.comparison?.delta;

  const issueCards = issues
    .slice(0, 40)
    .map(
      (i, idx) => `
      <article class="issue">
        <header>
          <span class="idx">#${idx + 1}</span>
          <code>${escapeHtml(i.selector)}</code>
        </header>
        <p><strong>What’s wrong:</strong> ${escapeHtml(i.what_is_wrong)}</p>
        <p><strong>Why it matters:</strong> ${escapeHtml(i.why_it_matters)}</p>
        <p><strong>Fix (plain English):</strong> ${escapeHtml(i.layman_fix)}</p>
        <p><strong>Developer:</strong> ${escapeHtml(i.developer_instruction)}</p>
        <pre class="patch">${escapeHtml(i.css_patch?.property)}: ${escapeHtml(i.css_patch?.value)};</pre>
      </article>`
    )
    .join("");

  const viewportRow = (report.viewports || [])
    .map((v) => {
      const afterVp = report.after?.viewports?.find((a) => a.name === v.name);
      return `<tr>
        <td>${escapeHtml(v.name)}</td>
        <td>${v.width}px</td>
        <td>${v.issue_count}${afterVp ? ` → ${afterVp.issue_count}` : ""}</td>
        <td>${v.axe?.violations ?? 0}${afterVp ? ` → ${afterVp.axe?.violations ?? 0}` : ""}</td>
        <td><a href="./${escapeHtml(v.screenshot)}">before</a>${afterVp ? ` · <a href="./${escapeHtml(afterVp.screenshot)}">after</a>` : ""}</td>
      </tr>`;
    })
    .join("");

  const afterBanner = hasAfter
    ? `<div class="compare-scores">
        <div class="score-card">
          <span class="label">Before</span>
          <strong>${beforeScore}</strong>
          <span class="badge ${report.pass ? "pass" : "fail"}">${report.pass ? "PASS" : "FAIL"}</span>
        </div>
        <div class="arrow">→</div>
        <div class="score-card">
          <span class="label">After (patched)</span>
          <strong>${afterScore}</strong>
          <span class="badge ${report.after.pass ? "pass" : "fail"}">${report.after.pass ? "PASS" : "FAIL"}</span>
        </div>
        <div class="delta ${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "+" : ""}${delta} pts · ${issues.length} → ${report.after.issue_count} issues</div>
      </div>`
    : `<div class="score">
        <strong>${beforeScore}</strong>
        <span class="muted">/ 100</span>
        <span class="badge ${report.pass ? "pass" : "fail"}">${report.pass ? "PASS" : "FAIL"}</span>
        <p class="muted" style="margin-left:12px">After not generated yet — run <code>npm run remediate && npm run audit-after</code></p>
      </div>`;

  const visualCompare = hasAfter
    ? `<section class="card span">
        <div class="compare-head">
          <h2>Visual before / after</h2>
          <label class="slider-label">Drag to compare
            <input type="range" id="slider" min="0" max="100" value="50" />
          </label>
        </div>
        <div class="compare" id="compare">
          <img class="after-img" src="./after.png" alt="After patch screenshot" />
          <div class="before-clip" id="beforeClip">
            <img class="before-img" src="./before.png" alt="Before audit screenshot" />
          </div>
          <div class="handle" id="handle"></div>
          <span class="tag before-tag">Before</span>
          <span class="tag after-tag">After</span>
        </div>
      </section>`
    : `<section class="card span">
        <h2>Before screenshot</h2>
        <img src="./before.png" alt="Before audit screenshot" />
      </section>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>UI/UX Before/After Report · audit_skill_file.md</title>
  <style>
    :root { --bg:#f8fafc; --card:#fff; --fg:#0f172a; --muted:#64748b; --line:#e2e8f0; --ok:#10b981; --bad:#ef4444; }
    body { margin:0; font-family: Inter, system-ui, sans-serif; background:var(--bg); color:var(--fg); }
    main { max-width: 1100px; margin: 0 auto; padding: 32px 20px 64px; }
    h1 { margin:0 0 8px; font-size:28px; }
    .muted { color:var(--muted); }
    .score { display:flex; align-items:baseline; gap:12px; margin:20px 0 28px; flex-wrap:wrap; }
    .score strong { font-size:48px; letter-spacing:-.03em; }
    .badge { padding:4px 10px; border-radius:999px; font-size:13px; font-weight:700; }
    .pass { background:#d1fae5; color:#065f46; }
    .fail { background:#fee2e2; color:#991b1b; }
    .compare-scores { display:flex; align-items:center; gap:16px; flex-wrap:wrap; margin:20px 0 28px; }
    .score-card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px 16px; min-width:120px; }
    .score-card .label { display:block; color:var(--muted); font-size:12px; margin-bottom:4px; }
    .score-card strong { font-size:36px; }
    .arrow { font-size:28px; color:var(--muted); }
    .delta { font-weight:700; padding:8px 12px; border-radius:8px; background:#ecfdf5; color:#065f46; }
    .delta.down { background:#fef2f2; color:#991b1b; }
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
    .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px; }
    .card.span { grid-column: 1 / -1; }
    img { width:100%; border-radius:10px; border:1px solid var(--line); display:block; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th, td { text-align:left; padding:8px 6px; border-bottom:1px solid var(--line); }
    th { color:var(--muted); }
    .issue { border:1px solid var(--line); border-radius:12px; padding:14px; margin:12px 0; background:#fff; }
    .issue header { display:flex; gap:10px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
    .idx { background:#0f172a; color:#fff; border-radius:999px; padding:2px 8px; font-size:12px; }
    code { font-size:12px; background:#f1f5f9; padding:2px 6px; border-radius:6px; }
    .patch { background:#0f172a; color:#e2e8f0; padding:10px 12px; border-radius:8px; overflow:auto; }
    .compare-head { display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
    .slider-label { font-size:13px; color:var(--muted); display:flex; align-items:center; gap:8px; }
    .compare { position:relative; overflow:hidden; border-radius:12px; border:1px solid var(--line); user-select:none; }
    .compare img { border:0; border-radius:0; width:100%; }
    .before-clip { position:absolute; inset:0 auto 0 0; width:50%; overflow:hidden; border-right:2px solid #fff; }
    .before-img { width: var(--compare-width, 1100px); max-width:none; }
    .handle { position:absolute; top:0; bottom:0; left:50%; width:2px; background:#fff; box-shadow:0 0 0 1px rgb(15 23 42 / .3); }
    .tag { position:absolute; top:12px; z-index:2; background:rgb(15 23 42 / .75); color:#fff; font-size:12px; font-weight:700; padding:4px 8px; border-radius:6px; }
    .before-tag { left:12px; }
    .after-tag { right:12px; }
    @media (max-width:900px){ .grid{ grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>UI/UX Before / After Report</h1>
    <p class="muted">Quality model: <strong>audit_skill_file.md</strong> · ${escapeHtml(report.url)} · ${escapeHtml(report.timestamp)}</p>
    ${afterBanner}
    <div class="grid">
      ${visualCompare}
      <section class="card span">
        <h2>Responsive runs</h2>
        <table>
          <thead><tr><th>Viewport</th><th>Width</th><th>Issues</th><th>axe</th><th>Shots</th></tr></thead>
          <tbody>${viewportRow}</tbody>
        </table>
        <p class="muted" style="margin-top:12px">${hasAfter ? "Patched via artifacts/latest/patch.css from issues[].css_patch." : "Run remediate + audit-after to generate the After column."}</p>
      </section>
    </div>
    <section style="margin-top:20px">
      <h2>Before findings (${issues.length})${hasAfter ? ` · After remaining (${afterIssues.length})` : ""}</h2>
      ${issueCards || "<p class='muted'>No issues found.</p>"}
    </section>
  </main>
  <script>
    const compare = document.getElementById('compare');
    const clip = document.getElementById('beforeClip');
    const handle = document.getElementById('handle');
    const slider = document.getElementById('slider');
    if (compare && clip && handle && slider) {
      const syncWidth = () => {
        compare.style.setProperty('--compare-width', compare.clientWidth + 'px');
      };
      syncWidth();
      window.addEventListener('resize', syncWidth);
      const setPos = (pct) => {
        const p = Math.max(0, Math.min(100, pct));
        clip.style.width = p + '%';
        handle.style.left = p + '%';
        slider.value = String(Math.round(p));
      };
      slider.addEventListener('input', () => setPos(Number(slider.value)));
      let dragging = false;
      const move = (clientX) => {
        const rect = compare.getBoundingClientRect();
        setPos(((clientX - rect.left) / rect.width) * 100);
      };
      compare.addEventListener('pointerdown', (e) => { dragging = true; move(e.clientX); compare.setPointerCapture(e.pointerId); });
      compare.addEventListener('pointermove', (e) => { if (dragging) move(e.clientX); });
      compare.addEventListener('pointerup', () => { dragging = false; });
    }
  </script>
</body>
</html>`;

  await mkdir(outDir, { recursive: true });
  const htmlPath = path.join(outDir, "report.html");
  await writeFile(htmlPath, html);
  console.log(`\n📄 Report written: ${htmlPath}`);
  if (hasAfter) console.log("   Includes before/after slider comparison.");

  const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(openCmd, [htmlPath], { stdio: "ignore", detached: true }).unref();
  console.log("Opened in browser.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
