import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import type { DomSummary } from '../types.ts';
import { SPACING_PROPERTIES } from '../tracks/spacingLinter.ts';

export async function settlePage(page: Page): Promise<void> {
  await page.evaluate(`new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)));
  })`);
}

export async function capturePage(page: Page, artifactsDir: string): Promise<DomSummary> {
  await mkdir(artifactsDir, { recursive: true });
  const summary = await collectDomSummary(page);
  await page.screenshot({ path: path.join(artifactsDir, 'viewport.png') });
  await page.screenshot({ path: path.join(artifactsDir, 'fullpage.png'), fullPage: true });
  await writeFile(path.join(artifactsDir, 'dom.html'), await page.content());
  await writeFile(path.join(artifactsDir, 'styles.json'), JSON.stringify(summary.samples, null, 2));
  await writeFile(
    path.join(artifactsDir, 'dom-summary.json'),
    JSON.stringify(
      { title: summary.title, headings: summary.headings, primaryButtons: summary.primaryButtons },
      null,
      2,
    ),
  );
  return summary;
}

export async function collectDomSummary(page: Page): Promise<DomSummary> {
  const properties = JSON.stringify([...SPACING_PROPERTIES]);
  return page.evaluate(`(() => {
    const properties = ${properties};
    function cssPath(el) {
      if (el.id) return '#' + CSS.escape(el.id);
      const testId = el.getAttribute('data-testid');
      if (testId) return '[data-testid="' + CSS.escape(testId) + '"]';
      const parts = [];
      let current = el;
      while (current && current.tagName !== 'HTML') {
        let part = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (parent) {
          const same = [...parent.children].filter((child) => child.tagName === current.tagName);
          if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(current) + 1) + ')';
        }
        parts.unshift(part);
        current = parent;
      }
      return parts.join(' > ');
    }
    function readPx(value) {
      if (!value || value === 'normal' || value === 'auto' || !value.endsWith('px')) return null;
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? Math.round(parsed) : null;
    }
    function textOf(el) {
      return (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
    }
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((el) => ({
      level: Number(el.tagName.slice(1)),
      text: textOf(el),
      selector: cssPath(el),
    }));
    const primaryButtons = [...document.querySelectorAll('button.btn-primary, a.btn-primary, [data-variant="primary"]')].map((el) => ({
      selector: cssPath(el),
      text: textOf(el),
    }));
    const seen = new Set();
    const samples = [];
    const nodes = document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,button,a,label,input,li,[data-audit-spacing],[data-audit-font]');
    for (const el of nodes) {
      if (seen.has(el) || samples.length >= 200) continue;
      seen.add(el);
      const computed = getComputedStyle(el);
      if (computed.display === 'none') continue;
      const parentFont = el.parentElement ? getComputedStyle(el.parentElement).fontSize : null;
      const spacing = [];
      if (el.hasAttribute('data-audit-spacing')) {
        for (const property of properties) {
          const kebab = property.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
          const px = readPx(computed.getPropertyValue(kebab));
          if (px !== null) spacing.push({ property, px });
        }
      }
      samples.push({
        selector: cssPath(el),
        tag: el.tagName.toLowerCase(),
        text: textOf(el),
        fontSizePx: readPx(computed.fontSize),
        fontSizeExplicit: el.hasAttribute('data-audit-font') || (parentFont !== null && computed.fontSize !== parentFont),
        auditSpacing: el.hasAttribute('data-audit-spacing'),
        spacing,
      });
    }
    return { title: document.title, headings, primaryButtons, samples };
  })()`) as Promise<DomSummary>;
}
