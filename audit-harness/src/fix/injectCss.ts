import { readFileSync } from 'node:fs';
import type { Page } from 'playwright';
import type { FixManifest } from '../types.ts';

const ATTRIBUTE_NAMES = new Set([
  'aria-label',
  'aria-labelledby',
  'aria-hidden',
  'aria-describedby',
  'for',
  'role',
  'class',
  'id',
  'type',
]);
const INSERT_TAGS = new Set(['label', 'span', 'p', 'h2', 'h3', 'div']);
const RETAG_TAGS = new Set(['h2', 'h3', 'p']);

export function loadFixManifest(filePath: string): FixManifest {
  const manifest = JSON.parse(readFileSync(filePath, 'utf8')) as FixManifest;
  assertSafeFix(manifest);
  return manifest;
}

export function assertSafeFix(manifest: FixManifest): void {
  const hasWork = Boolean(
    manifest.css || manifest.attributes?.length || manifest.inserts?.length || manifest.retags?.length,
  );
  if (!hasWork) throw new Error('Fix manifest has nothing to apply');
  if (manifest.css && /<\/style/i.test(manifest.css)) {
    throw new Error('Fix CSS cannot close the style tag');
  }
  for (const attribute of manifest.attributes ?? []) {
    assertSelector(attribute.selector);
    assertAttribute(attribute.name, attribute.value);
  }
  for (const insert of manifest.inserts ?? []) {
    assertSelector(insert.selector);
    if (!INSERT_TAGS.has(insert.tag)) throw new Error(`Insert tag "${insert.tag}" is not allowed`);
    if (insert.position !== 'before' && insert.position !== 'after') {
      throw new Error('Insert position must be before or after');
    }
    if (typeof insert.text !== 'string' || /[<>]/.test(insert.text)) {
      throw new Error('Insert text cannot contain markup');
    }
    for (const [name, value] of Object.entries(insert.attrs ?? {})) assertAttribute(name, value);
  }
  for (const retag of manifest.retags ?? []) {
    assertSelector(retag.selector);
    if (!RETAG_TAGS.has(retag.tag)) throw new Error(`Retag tag "${retag.tag}" is not allowed`);
  }
}

export async function applyFixManifest(page: Page, manifest: FixManifest): Promise<void> {
  assertSafeFix(manifest);
  if (manifest.css) await page.addStyleTag({ content: manifest.css });
  const ops = {
    attributes: manifest.attributes ?? [],
    inserts: manifest.inserts ?? [],
    retags: manifest.retags ?? [],
  };
  if (!ops.attributes.length && !ops.inserts.length && !ops.retags.length) return;
  await page.evaluate(`(() => {
    const payload = ${JSON.stringify(ops)};
    for (const retag of payload.retags) {
      const current = document.querySelector(retag.selector);
      if (!current || !current.parentNode) continue;
      const next = document.createElement(retag.tag);
      for (const attr of [...current.attributes]) next.setAttribute(attr.name, attr.value);
      while (current.firstChild) next.appendChild(current.firstChild);
      current.parentNode.replaceChild(next, current);
    }
    for (const attribute of payload.attributes) {
      const target = document.querySelector(attribute.selector);
      if (target) target.setAttribute(attribute.name, attribute.value);
    }
    for (const insert of payload.inserts) {
      const target = document.querySelector(insert.selector);
      if (!target || !target.parentNode) continue;
      const element = document.createElement(insert.tag);
      element.textContent = insert.text;
      for (const [name, value] of Object.entries(insert.attrs || {})) element.setAttribute(name, value);
      if (insert.position === 'after') target.parentNode.insertBefore(element, target.nextSibling);
      else target.parentNode.insertBefore(element, target);
    }
  })()`);
}

function assertSelector(selector: string): void {
  if (!selector || selector.length > 300 || /[{}<>]/.test(selector)) {
    throw new Error(`Unsafe selector: ${selector}`);
  }
}

function assertAttribute(name: string, value: string): void {
  if (!ATTRIBUTE_NAMES.has(name)) throw new Error(`Attribute "${name}" is not allowed`);
  if (typeof value !== 'string' || /[<>]/.test(value) || /javascript:/i.test(value)) {
    throw new Error(`Unsafe value for ${name}`);
  }
}
