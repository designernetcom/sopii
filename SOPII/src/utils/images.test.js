import { describe, it, expect } from 'vitest';

import { IMAGE_SIZES, cdn, cdnMedia, cdnSrcSet, fallbackImage, mediaUrl } from './images';

/*
 * The image resolver (§7).
 * ===========================================================================
 * Every image URL the shop renders goes through this file, which makes its
 * contract mostly about what it must *not* break. It is applied to Cloudinary
 * URLs, to `/media/...` paths still served off the API's disk, to pasted
 * absolute URLs and to generated placeholders — often twice, by two layers
 * that each want a size. So: idempotent, and a no-op on anything it cannot
 * improve.
 *
 * The one URL treated as nothing at all is `blob:`. Those point into the
 * memory of a single admin browser tab, so one that reached a record is dead
 * by the time a shopper reads it.
 */

const CLOUD = 'https://res.cloudinary.com/demo/image/upload/v1712345678/sopii/products/prd_1/main.jpg';

/* ------------------------------- media paths -------------------------------- */

describe('mediaUrl', () => {
  it('passes an absolute URL through untouched', () => {
    expect(mediaUrl('https://example.com/a.jpg')).toBe('https://example.com/a.jpg');
    expect(mediaUrl('//example.com/a.jpg')).toBe('//example.com/a.jpg');
  });

  it('passes a data URI through untouched', () => {
    expect(mediaUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });

  it('resolves a library path against the media base', () => {
    expect(mediaUrl('/media/a.jpg')).toMatch(/\/media\/a\.jpg$/);
    expect(mediaUrl('media/a.jpg')).toMatch(/\/media\/a\.jpg$/);
  });

  it('does not double the separator for a path that already has one', () => {
    expect(mediaUrl('/media/a.jpg')).not.toMatch(/\/\/media/);
  });

  it('answers null for a blob URL, so the placeholder paints immediately', () => {
    // A blob: URL that reached a record is already dead — returning null beats
    // waiting on a request that cannot succeed.
    expect(mediaUrl('blob:http://localhost/9f3c')).toBeNull();
  });

  it('answers null for nothing at all', () => {
    expect(mediaUrl('')).toBeNull();
    expect(mediaUrl('   ')).toBeNull();
    expect(mediaUrl(null)).toBeNull();
    expect(mediaUrl(undefined)).toBeNull();
    expect(mediaUrl(42)).toBeNull();
  });
});

/* ------------------------------ CDN transforms ------------------------------ */

describe('cdn', () => {
  it('inserts the preset transformation', () => {
    expect(cdn(CLOUD, 'card')).toContain(
      '/image/upload/f_auto,q_auto,c_fill,g_auto,w_600,h_750,dpr_auto/',
    );
  });

  it('keeps the version segment and the public id', () => {
    const out = cdn(CLOUD, 'thumb');
    expect(out).toContain('/v1712345678/');
    expect(out.endsWith('sopii/products/prd_1/main.jpg')).toBe(true);
  });

  it('replaces an existing transformation rather than stacking one', () => {
    // Two layers each applying a preset must land on one transformation.
    const once = cdn(CLOUD, 'card');
    expect(cdn(once, 'card')).toBe(once);
    expect(cdn(once, 'card').match(/f_auto/g)).toHaveLength(1);
  });

  it('re-presets an already-sized URL to the size the caller wants', () => {
    const thumb = cdn(cdn(CLOUD, 'detail'), 'thumb');
    expect(thumb).toContain('w_200,h_250');
    expect(thumb).not.toContain('w_1200');
  });

  it('defaults to format and quality only, with no resize', () => {
    expect(cdn(CLOUD)).toContain('/f_auto,q_auto/');
    expect(cdn(CLOUD)).not.toContain('w_');
  });

  it('falls back to the default preset for an unknown name', () => {
    expect(cdn(CLOUD, 'nonsense')).toBe(cdn(CLOUD, 'auto'));
  });

  it('passes a non-Cloudinary URL through untouched', () => {
    // What makes it safe to wrap every image, migrated or not.
    for (const url of ['/media/a.jpg', 'https://example.com/a.jpg', 'data:image/png;base64,AA']) {
      expect(cdn(url, 'card')).toBe(url);
    }
  });

  it('is not fooled by a host that merely contains the CDN name', () => {
    const spoof = 'https://evil.example/res.cloudinary.com/image/upload/x.jpg';
    expect(cdn(spoof, 'card')).toBe(spoof);
  });

  it('answers null for nothing', () => {
    expect(cdn('')).toBeNull();
    expect(cdn(null)).toBeNull();
    expect(cdn(undefined)).toBeNull();
  });
});

describe('cdnMedia', () => {
  it('resolves the path and then transforms it', () => {
    expect(cdnMedia(CLOUD, 'card')).toBe(cdn(CLOUD, 'card'));
  });

  it('answers null for a blob URL, exactly as mediaUrl does', () => {
    expect(cdnMedia('blob:http://localhost/9f3c', 'card')).toBeNull();
  });
});

/* -------------------------------- srcset ----------------------------------- */

describe('cdnSrcSet', () => {
  it('builds one candidate per width, each with its width descriptor', () => {
    const set = cdnSrcSet(CLOUD, 'card').split(', ');

    expect(set).toHaveLength(4);
    expect(set.map((entry) => entry.split(' ')[1])).toEqual(['300w', '450w', '600w', '900w']);
  });

  it('keeps the preset’s aspect ratio at every width', () => {
    // A resized crop that loses its shape reflows the grid mid-scroll.
    const set = cdnSrcSet(CLOUD, 'card');
    expect(set).toContain('w_300,h_375');
    expect(set).toContain('w_600,h_750');
  });

  it('uses c_limit with no height where the preset has no ratio', () => {
    const set = cdnSrcSet(CLOUD, 'detail');
    expect(set).toContain('c_limit,w_600');
    expect(set).not.toContain('h_');
  });

  it('always asks the CDN to pick the format and quality', () => {
    cdnSrcSet(CLOUD, 'card')
      .split(', ')
      .forEach((entry) => expect(entry).toContain('f_auto,q_auto'));
  });

  it('answers null for a non-Cloudinary URL rather than four identical candidates', () => {
    // There is no resizing service behind a /media path; a srcset of four
    // identical URLs makes the markup larger and the page no faster.
    expect(cdnSrcSet('/media/a.jpg', 'card')).toBeNull();
    expect(cdnSrcSet('https://example.com/a.jpg', 'card')).toBeNull();
  });

  it('answers null for a preset that has no widths', () => {
    expect(cdnSrcSet(CLOUD, 'thumb')).toBeNull();
    expect(cdnSrcSet(CLOUD, 'nonsense')).toBeNull();
  });

  it('answers null for nothing', () => {
    expect(cdnSrcSet('', 'card')).toBeNull();
    expect(cdnSrcSet(null, 'card')).toBeNull();
  });
});

describe('IMAGE_SIZES', () => {
  it('describes a real CSS width for every layout it names', () => {
    // Without `sizes` the browser assumes the image fills the viewport and
    // picks the largest candidate, which makes a srcset harmful on a phone.
    Object.values(IMAGE_SIZES).forEach((value) => expect(value).toMatch(/vw|px/));
  });

  it('narrows the card as the viewport widens', () => {
    expect(IMAGE_SIZES.card).toContain('min-width');
    expect(IMAGE_SIZES.banner).toBe('100vw');
  });
});

/* ------------------------------- fallback ---------------------------------- */

describe('fallbackImage', () => {
  it('returns something renderable with no network behind it', () => {
    const src = fallbackImage('SOPII');
    expect(typeof src).toBe('string');
    expect(src.length).toBeGreaterThan(0);
    expect(src).toMatch(/^data:|^\//);
  });

  it('is stable for the same label, so it does not flicker between renders', () => {
    expect(fallbackImage('Sarees')).toBe(fallbackImage('Sarees'));
  });
});
