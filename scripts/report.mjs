#!/usr/bin/env node
/**
 * Before/After report for audit_skill_file.md skill schema.
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

function severityClass(s) {
  return String(s || "medium").toLowerCase();
}

async function main() {
  if (!(await exists(reportJson))) {
    console.error("\n❌ No audit artifacts. Run audit:full first.\n");
    process.exit(1);
  }

  const report = JSON.parse(await readFile(reportJson, "utf8"));
  const issues = report.issues || [];
  const hasAfter = Boolean(report.after) && (await exists(path.join(outDir, "after.png")));
  const categories = report.availableCategories || [...new Set(issues.map((i) => i.category))];
  const summary = report.executiveSummary || {};

  // Hero metric = issue count (must go DOWN after remediation). Quality score is secondary.
  const beforeIssues = issues.length;
  const afterIssues = report.after?.issue_count ?? report.after?.issues?.length;
  const issuesDelta =
    afterIssues == null ? null : afterIssues - beforeIssues; // negative = improvement
  const beforeScore = report.score;
  const afterScore = report.after?.score;

  const filterTabs = categories
    .map((c) => `<button type="button" class="tab" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`)
    .join("");

  const issueCards = issues
    .map((i, idx) => {
      const thumb = i.elementScreenshot
        ? `<figure class="el-shot">
            <img src="./${escapeHtml(i.elementScreenshot)}" alt="Highlighted UI element for issue #${idx + 1}" loading="lazy" />
            <figcaption>Actual UI element (highlighted)</figcaption>
          </figure>`
        : `<div class="el-shot missing"><span>No element preview</span></div>`;
      return `
      <article class="issue" data-category="${escapeHtml(i.category)}" data-severity="${escapeHtml(i.severity)}">
        <header>
          <span class="sev ${severityClass(i.severity)}">${escapeHtml(i.severity)}</span>
          <span class="cat">${escapeHtml(i.category)}</span>
          <span class="idx">#${idx + 1}</span>
        </header>
        <div class="issue-body">
          ${thumb}
          <div class="issue-copy">
            <code>${escapeHtml(i.selector)}</code>
            <p><strong>Problem:</strong> ${escapeHtml(i.problem)}</p>
            <p><strong>Why it’s wrong:</strong> ${escapeHtml(i.whyItIsWrong)}</p>
            <p><strong>Framework:</strong> ${escapeHtml(i.frameworkViolation)}</p>
            <p><strong>Fix:</strong> ${escapeHtml(i.fixInstruction)}</p>
            <p><strong>Impact:</strong> ${escapeHtml(i.impact)}</p>
          </div>
        </div>
      </article>`;
    })
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
          <span class="label">Before · ${escapeHtml(summary.overallHealth || "")} · issues</span>
          <strong>${beforeIssues}</strong>
        </div>
        <div class="arrow">→</div>
        <div class="score-card">
          <span class="label">After · ${escapeHtml(report.after.executiveSummary?.overallHealth || "")} · issues</span>
          <strong>${afterIssues}</strong>
        </div>
        <div class="delta ${issuesDelta <= 0 ? "up" : "down"}">${issuesDelta <= 0 ? "" : "+"}${issuesDelta} issues · quality ${beforeScore}→${afterScore}</div>
      </div>`
    : `<div class="score"><strong>${beforeIssues}</strong><span class="muted"> issues · quality ${beforeScore}/100 · ${escapeHtml(summary.overallHealth || "")}</span></div>`;

  const visualCompare = hasAfter
    ? `<section class="card span">
        <div class="compare-head">
          <h2>Visual before / after</h2>
          <label class="slider-label">Drag to compare <input type="range" id="slider" min="0" max="100" value="50" /></label>
        </div>
        <div class="compare" id="compare">
          <img class="after-img" src="./after.png" alt="After" />
          <div class="before-clip" id="beforeClip"><img class="before-img" src="./before.png" alt="Before" /></div>
          <div class="handle" id="handle"></div>
          <span class="tag before-tag">Before</span>
          <span class="tag after-tag">After</span>
        </div>
      </section>`
    : `<section class="card span"><h2>Before</h2><img src="./before.png" alt="Before" /></section>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>UI/UX Audit Report</title>
  <style>
    :root {
      --bg: #10141a;
      --card: #1a212b;
      --line: #2c3644;
      --text: #eef3f8;
      --muted: #9aa8b8;
      --accent: #3dd6c6;
      --accent-ink: #06221e;
      --danger: #ff8b8b;
      --danger-bg: #3a1c22;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(900px 420px at 10% -10%, rgba(61, 214, 198, 0.16), transparent 60%),
        var(--bg);
      color: var(--text);
      font: 16px/1.45 ui-sans-serif, system-ui, sans-serif;
    }
    main { width: min(1100px, calc(100% - 32px)); margin: 48px auto 64px; }
    h1 { margin: 0 0 8px; font-size: 32px; letter-spacing: -0.03em; }
    h2 { margin: 0 0 8px; font-size: 18px; }
    a { color: var(--accent); }
    .lede { margin: 0 0 24px; color: var(--muted); }
    .home {
      display: inline-block;
      margin: 0 0 20px;
      color: var(--accent-ink);
      background: var(--accent);
      text-decoration: none;
      font-weight: 750;
      border-radius: 999px;
      padding: 10px 16px;
    }
    .muted { color: var(--muted); }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 0 0 16px; }
    .summary strong { font-size: 22px; display: block; margin-top: 6px; }
    .compare-scores { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin: 0 0 16px; }
    .score-card, .card, .issue {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 20px;
    }
    .score-card strong { font-size: 36px; letter-spacing: -0.03em; }
    .score-card .label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 4px; }
    .arrow { font-size: 28px; color: var(--muted); }
    .delta { font-weight: 750; padding: 10px 14px; border-radius: 999px; background: #102824; color: var(--accent); }
    .delta.down { background: var(--danger-bg); color: var(--danger); }
    .grid { display: grid; gap: 16px; }
    .card.span { grid-column: 1 / -1; }
    img { width: 100%; border-radius: 10px; border: 1px solid var(--line); display: block; background: #0e1319; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); }
    th { color: var(--muted); font-weight: 650; }
    .tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
    .tab, .tab-all {
      border: 1px solid var(--line);
      background: transparent;
      color: var(--text);
      border-radius: 999px;
      padding: 8px 14px;
      cursor: pointer;
      font: inherit;
      font-size: 14px;
      font-weight: 650;
    }
    .tab.active, .tab-all.active { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
    .issue { margin: 12px 0; }
    .issue header { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
    .issue-body { display: grid; grid-template-columns: 220px 1fr; gap: 16px; align-items: start; }
    .el-shot { margin: 0; background: #0e1319; border-radius: 10px; overflow: hidden; border: 1px solid var(--line); }
    .el-shot img { width: 100%; display: block; border: 0; border-radius: 0; background: #0e1319; max-height: 180px; object-fit: contain; }
    .el-shot figcaption { font-size: 12px; color: var(--muted); padding: 6px 8px; text-align: center; }
    .el-shot.missing { min-height: 120px; display: grid; place-items: center; color: var(--muted); font-size: 13px; background: #0e1319; }
    .sev { font-size: 12px; font-weight: 750; padding: 4px 10px; border-radius: 999px; }
    .sev.critical { background: var(--danger-bg); color: var(--danger); }
    .sev.high { background: #3a2a14; color: #ffc48a; }
    .sev.medium { background: #3a3414; color: #f6e08b; }
    .sev.low { background: #243040; color: #c5d0dc; }
    .cat, .idx { font-size: 13px; color: var(--muted); }
    .idx { margin-left: auto; }
    code { display: inline-block; font-size: 12px; background: #0e1319; color: var(--text); border: 1px solid var(--line); padding: 4px 8px; border-radius: 8px; margin-bottom: 8px; word-break: break-all; }
    input[type="range"] { accent-color: var(--accent); }
    .compare-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .slider-label { color: var(--muted); font-size: 14px; font-weight: 650; }
    .compare { position: relative; overflow: hidden; border-radius: 12px; border: 1px solid var(--line); user-select: none; }
    .compare img { border: 0; border-radius: 0; }
    .before-clip { position: absolute; inset: 0 auto 0 0; width: 50%; overflow: hidden; border-right: 2px solid var(--accent); }
    .before-img { width: var(--compare-width, 1100px); max-width: none; }
    .handle { position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; background: var(--accent); }
    .tag { position: absolute; top: 12px; z-index: 2; background: var(--accent); color: var(--accent-ink); font-size: 12px; font-weight: 750; padding: 4px 8px; border-radius: 999px; }
    .before-tag { left: 12px; }
    .after-tag { right: 12px; }
    .findings { margin-top: 16px; }
    [hidden] { display: none !important; }
    @media (max-width: 800px) {
      .issue-body { grid-template-columns: 1fr; }
      .summary { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <a class="home" id="home" href="/" hidden>Back to audit</a>
    <h1>UI/UX Audit Report</h1>
    <p class="lede">Skill: audit_skill_file.md · ${escapeHtml(report.url)} · ${escapeHtml(report.timestamp)}</p>
    <div class="summary">
      <div class="card"><span class="muted">Overall health</span><strong>${escapeHtml(summary.overallHealth || "—")}</strong></div>
      <div class="card"><span class="muted">Critical fires</span><strong>${escapeHtml(summary.criticalFires ?? "—")}</strong></div>
      <div class="card"><span class="muted">Top recommendation</span><strong style="font-size:14px;font-weight:600;line-height:1.4">${escapeHtml(summary.topRecommendation || "—")}</strong></div>
    </div>
    ${afterBanner}
    <div class="grid">
      ${visualCompare}
      <section class="card span">
        <h2>Responsive runs</h2>
        <table>
          <thead><tr><th>Viewport</th><th>Width</th><th>Issues</th><th>axe</th><th>Shots</th></tr></thead>
          <tbody>${viewportRow}</tbody>
        </table>
      </section>
    </div>
    <section class="findings">
      <h2>Findings (${issues.length})</h2>
      <div class="tabs">
        <button type="button" class="tab-all active" data-cat="__all">All</button>
        ${filterTabs}
      </div>
      <div id="issues">${issueCards || "<p class='muted'>No issues found.</p>"}</div>
    </section>
  </main>
  <script>
    if (location.protocol === "http:" || location.protocol === "https:") {
      document.getElementById("home").hidden = false;
    }
    document.querySelectorAll('.tab, .tab-all').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab, .tab-all').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const cat = btn.dataset.cat;
        document.querySelectorAll('.issue').forEach((el) => {
          el.style.display = cat === '__all' || el.dataset.category === cat ? '' : 'none';
        });
      });
    });
    const compare = document.getElementById('compare');
    const clip = document.getElementById('beforeClip');
    const handle = document.getElementById('handle');
    const slider = document.getElementById('slider');
    if (compare && clip && handle && slider) {
      const syncWidth = () => compare.style.setProperty('--compare-width', compare.clientWidth + 'px');
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
  if (process.env.AUDIT_NO_OPEN === "1") {
    console.log("Report left closed (AUDIT_NO_OPEN=1).\n");
    return;
  }
  const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(openCmd, [htmlPath], { stdio: "ignore", detached: true }).unref();
  console.log("Opened in browser.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
