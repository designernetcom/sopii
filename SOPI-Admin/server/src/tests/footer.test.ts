/*
 * Tests for the footer rules (`lib/footer.ts`).
 * ===========================================================================
 * The footer's links are written into an `href` on every page of the shop, so
 * the parser is a security boundary as much as a form validator: a link that
 * gets past it as `javascript:` is script on every page. The other contracts
 * fail quietly — a reorder that drops a section, a public feed that leaks a
 * switched-off link, a second copyright line — so they are pinned here too.
 *
 * Run with:  npm test        (in server/)
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { FooterSection } from '@/types';
import { isSafeFooterUrl } from '@/data/footer';
import {
  addFooterSection,
  DEFAULT_FOOTER_SECTIONS,
  parseFooterItems,
  parseFooterSectionInput,
  publicFooter,
  removeFooterSection,
  reorderFooterSections,
  updateFooterSection,
} from '../lib/footer.js';
import { HttpError } from '../lib/http.js';

function rejects(fn: () => unknown, match: RegExp, status = 400) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof HttpError, 'expected an HttpError');
    assert.equal(error.status, status);
    assert.match(error.message, match);
    return true;
  });
}

const defaults = () => structuredClone(DEFAULT_FOOTER_SECTIONS) as FooterSection[];

describe('isSafeFooterUrl', () => {
  it('accepts site paths, http(s), mailto and tel', () => {
    for (const url of [
      '/pages/faq',
      '/shop?category=Dresses',
      'https://netcom-india.com/',
      'http://example.com',
      'mailto:care@sopiistore.com',
      'tel:+91 81052 92614',
    ]) {
      assert.equal(isSafeFooterUrl(url), true, url);
    }
  });

  it('refuses script schemes, protocol-relative and bare hosts', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox',
      '//evil.example',
      '/\\evil.example',
      'evil.example',
      'https://',
      '',
    ]) {
      assert.equal(isSafeFooterUrl(url), false, url);
    }
  });
});

describe('parseFooterItems', () => {
  it('refuses an unsafe link', () => {
    rejects(
      () => parseFooterItems([{ label: 'Click', url: 'javascript:alert(1)' }], 'links'),
      /link must be/,
    );
  });

  it('whitelists item fields and fills defaults', () => {
    const [item] = parseFooterItems(
      [{ id: 'fitm_a', label: '  FAQ ', url: '/pages/faq', $where: 'x', enabled: false }],
      'links',
    );
    assert.deepEqual(item, {
      id: 'fitm_a',
      label: 'FAQ',
      url: '/pages/faq',
      icon: '',
      color: '',
      enabled: false,
      openInNewTab: false,
    });
  });

  it('mints a fresh id for a missing, malformed or duplicate one', () => {
    const items = parseFooterItems(
      [
        { id: 'same', label: 'A', url: '/a' },
        { id: 'same', label: 'B', url: '/b' },
        { id: 'bad id!', label: 'C', url: '/c' },
        { label: 'D', url: '/d' },
      ],
      'links',
    );
    const ids = items.map((item) => item.id);
    assert.equal(ids[0], 'same');
    assert.equal(new Set(ids).size, 4);
    assert.ok(ids.slice(1).every((id) => id.startsWith('fitm_')));
  });

  it('payment badges need a label and carry no link', () => {
    const [badge] = parseFooterItems([{ label: 'UPI', url: 'https://ignored.example' }], 'payments');
    assert.equal(badge.url, '');
    rejects(() => parseFooterItems([{ label: '' }], 'payments'), /label is required/);
  });

  it('only accepts icons from the list', () => {
    assert.equal(parseFooterItems([{ label: 'T', url: '/t', icon: 'Truck' }], 'utility')[0].icon, 'Truck');
    rejects(() => parseFooterItems([{ label: 'T', url: '/t', icon: 'Bomb' }], 'utility'), /unknown icon/);
    rejects(() => parseFooterItems([{ label: 'X', url: 'https://x.com', icon: 'Myspace' }], 'social'), /platform/);
  });

  it('social channels default to the generic icon and validate the colour', () => {
    const [item] = parseFooterItems([{ label: 'Site', url: 'https://x.com', color: '#e1306c' }], 'social');
    assert.equal(item.icon, 'Globe');
    assert.equal(item.color, '#E1306C');
    rejects(
      () => parseFooterItems([{ label: 'X', url: 'https://x.com', color: 'red; background:url(x)' }], 'social'),
      /hex value/,
    );
  });

  it('enforces per-type item counts', () => {
    rejects(
      () =>
        parseFooterItems(
          [
            { label: 'A', url: '/a' },
            { label: 'B', url: '/b' },
          ],
          'credit',
        ),
      /at most 1 item\b/,
    );
    rejects(() => parseFooterItems([{ label: 'A', url: '/a' }], 'copyright'), /has no items/);
  });
});

describe('parseFooterSectionInput', () => {
  it('requires a known type on create', () => {
    rejects(() => parseFooterSectionInput({ title: 'X' }), /valid section type/);
    rejects(() => parseFooterSectionInput({ type: 'marquee' }), /valid section type/);
  });

  it('requires a heading for a link column, which is also its phone accordion', () => {
    rejects(() => parseFooterSectionInput({ type: 'links', title: '  ' }), /Title is required/);
  });

  it('gives untitled bottom-bar sections their default label', () => {
    assert.equal(parseFooterSectionInput({ type: 'legal' }).title, 'Policies');
  });

  it('keeps paragraphs in a text column but flattens the copyright line', () => {
    assert.equal(
      parseFooterSectionInput({ type: 'text', title: 'Hours', content: 'Mon–Sat\r\n\r\n\r\n10–7  ' }).content,
      'Mon–Sat\n\n10–7',
    );
    assert.equal(
      parseFooterSectionInput({ type: 'copyright', content: '© {year}\n{store}' }).content,
      '© {year} {store}',
    );
  });

  it('refuses body copy on a type that renders none', () => {
    rejects(() => parseFooterSectionInput({ type: 'legal', content: 'hello' }), /has no text/);
  });

  it('refuses a type change on update', () => {
    rejects(
      () => parseFooterSectionInput({ type: 'copyright' }, { existingType: 'links' }),
      /cannot change type/,
    );
  });

  it('an update only touches the fields it sends', () => {
    assert.deepEqual(parseFooterSectionInput({ enabled: false }, { existingType: 'links' }), {
      type: 'links',
      enabled: false,
    });
  });

  it('reads the brand display switches, defaulting to shown', () => {
    const out = parseFooterSectionInput({ type: 'brand', display: { phone: false } });
    assert.deepEqual(out.display, { logo: true, address: true, email: true, phone: false });
    rejects(
      () => parseFooterSectionInput({ type: 'brand', display: { phone: 'no' } }),
      /display.phone/,
    );
  });
});

describe('section operations', () => {
  it('adds a section at the end with a fresh id', () => {
    const next = addFooterSection(defaults(), {
      type: 'links',
      title: 'Help',
      items: [{ label: 'FAQ', url: '/pages/faq' }],
    });
    const added = next.at(-1)!;
    assert.equal(next.length, DEFAULT_FOOTER_SECTIONS.length + 1);
    assert.equal(added.title, 'Help');
    assert.match(added.id, /^fsec_/);
  });

  it('refuses a second copy of a one-per-footer type', () => {
    rejects(() => addFooterSection(defaults(), { type: 'copyright', content: '©' }), /already has a copyright/);
    // …but allows a second link column.
    assert.doesNotThrow(() => addFooterSection(defaults(), { type: 'links', title: 'More' }));
  });

  it('updates in place, keeping id, type and position', () => {
    const before = defaults();
    const next = updateFooterSection(before, 'fsec_care', { title: 'Help', enabled: false, id: 'hijack' });
    const index = next.findIndex((section) => section.id === 'fsec_care');
    assert.equal(index, before.findIndex((section) => section.id === 'fsec_care'));
    assert.equal(next[index].title, 'Help');
    assert.equal(next[index].enabled, false);
    assert.equal(next[index].type, 'links');
    assert.equal(next[index].items.length, before[index].items.length);
    // The input list is not mutated.
    assert.equal(before[index].title, 'Customer Care');
  });

  it('404s on an unknown section', () => {
    rejects(() => updateFooterSection(defaults(), 'nope', { title: 'x' }), /not found/, 404);
    rejects(() => removeFooterSection(defaults(), 'nope'), /not found/, 404);
  });

  it('removes a section', () => {
    const next = removeFooterSection(defaults(), 'fsec_credit');
    assert.equal(next.some((section) => section.id === 'fsec_credit'), false);
  });

  it('reorders when every id is named exactly once', () => {
    const ids = defaults().map((section) => section.id).reverse();
    assert.deepEqual(
      reorderFooterSections(defaults(), ids).map((section) => section.id),
      ids,
    );
  });

  it('refuses a partial, duplicated or unknown reorder instead of guessing', () => {
    const ids = defaults().map((section) => section.id);
    rejects(() => reorderFooterSections(defaults(), ids.slice(1)), /changed since/);
    rejects(() => reorderFooterSections(defaults(), [...ids.slice(1), ids[1]]), /changed since/);
    rejects(() => reorderFooterSections(defaults(), [...ids.slice(1), 'ghost']), /changed since/);
    rejects(() => reorderFooterSections(defaults(), 'fsec_brand'), /list of section ids/);
  });
});

describe('publicFooter', () => {
  it('drops switched-off sections and items, and admin-only fields', () => {
    const feed = publicFooter(defaults());
    const ids = feed.sections.map((section) => section.id);

    assert.equal(ids.includes('fsec_social'), false, 'the social column is off by default');
    const shop = feed.sections.find((section) => section.id === 'fsec_shop')!;
    assert.deepEqual(
      shop.items.map((item) => item.label),
      ['New Arrivals', 'Sarees', 'Bestsellers', 'Sale'],
    );
    assert.equal('enabled' in shop, false);
    assert.equal('enabled' in shop.items[0], false);
  });

  it('still sends the social channels for the rail while the column is hidden', () => {
    const feed = publicFooter(defaults());
    assert.deepEqual(
      feed.socialLinks.map((item) => item.label),
      ['Instagram', 'YouTube'],
    );
  });

  it('keeps the section order', () => {
    const sections = reorderFooterSections(
      defaults(),
      defaults().map((section) => section.id).reverse(),
    );
    const feed = publicFooter(sections);
    assert.equal(feed.sections[0].id, 'fsec_credit');
  });

  it('never publishes an unsafe link from a hand-edited document', () => {
    const sections = defaults();
    sections[1].items.push({
      id: 'x',
      label: 'Evil',
      url: 'javascript:alert(1)',
      icon: '',
      color: '',
      enabled: true,
      openInNewTab: false,
    });
    const shop = publicFooter(sections).sections.find((section) => section.id === 'fsec_shop')!;
    assert.equal(shop.items.some((item) => item.label === 'Evil'), false);
  });

  it('only brand sections carry display switches', () => {
    const feed = publicFooter(defaults());
    assert.ok(feed.sections.find((section) => section.type === 'brand')!.display);
    assert.equal(
      feed.sections.filter((section) => section.type !== 'brand').some((section) => 'display' in section),
      false,
    );
  });
});
