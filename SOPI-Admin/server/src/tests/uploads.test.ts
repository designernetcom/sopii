/*
 * Tests for image handling and the upload gate (§7, §17).
 * ===========================================================================
 * Two separate concerns share this file because they share a module.
 *
 * The *security* half is the upload validation. An upload route that accepts
 * `image/svg+xml` is script execution on the store's own origin the moment
 * that file is rendered through an `<img>` a browser decides to treat as a
 * document, and an upload route with no size ceiling is a way to spend the
 * store's Cloudinary bill. Neither refusal has a visible symptom when it
 * silently stops working — the uploads simply start succeeding.
 *
 * The *correctness* half is `withTransform`. It is applied to every image URL
 * the API emits, including URLs that have already been through it and URLs
 * that are not Cloudinary's at all, so "idempotent and harmless" is the whole
 * contract.
 *
 * Cloudinary credentials are faked in the environment before the module loads,
 * which is what makes `uploadImage` reach its validation instead of refusing
 * with "not configured". Every assertion below fails *before* any network
 * call, so nothing here talks to Cloudinary.
 *
 * Run with:  npm test        (in server/)
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.CLOUDINARY_CLOUD_NAME ||= 'test-cloud';
process.env.CLOUDINARY_API_KEY ||= '000000000000000';
process.env.CLOUDINARY_API_SECRET ||= 'test-secret';

/* Loaded after the environment above, so `isConfigured` is true. */
const {
  CloudinaryError,
  dataUriBytes,
  derivedPublicId,
  isCloudinaryUrl,
  isDataUri,
  uploadImage,
  withTransform,
  MAX_UPLOAD_BYTES,
} = await import('../lib/cloudinary.js');

/** A data URI of `bytes` decoded bytes with the given declared type. */
function dataUri(mime: string, bytes: number): string {
  return `data:${mime};base64,${Buffer.alloc(bytes, 0x41).toString('base64')}`;
}

const CLOUD = 'https://res.cloudinary.com/demo/image/upload/v1712345678/sopii/products/prd_1/main.jpg';

/* ------------------------------ upload gate -------------------------------- */

describe('uploads: what the gate refuses (§17)', () => {
  it('refuses an SVG, whatever it claims to be a picture of', async () => {
    // The whole reason for an allowlist rather than a blocklist: SVG is a
    // document format with script in it, delivered from the store's origin.
    await assert.rejects(
      () => uploadImage(dataUri('image/svg+xml', 64), { folder: 'sopii/test' }),
      (error: InstanceType<typeof CloudinaryError>) => {
        assert.equal(error.name, 'CloudinaryError');
        assert.equal(error.status, 415);
        return true;
      },
    );
  });

  it('refuses every type outside the allowlist', async () => {
    // Two refusal codes, both closed doors: an *image* type that is not on the
    // allowlist is a 415, and a payload that is not an image data URI at all
    // never matches the data-URI shape, so it is rejected as malformed (400).
    const cases: [string, number][] = [
      ['image/svg+xml', 415],
      ['image/bmp', 415],
      ['image/tiff', 415],
      ['text/html', 400],
      ['application/pdf', 400],
      ['application/javascript', 400],
    ];

    for (const [mime, status] of cases) {
      await assert.rejects(
        () => uploadImage(dataUri(mime, 32), { folder: 'sopii/test' }),
        (error: InstanceType<typeof CloudinaryError>) => {
          assert.equal(error.status, status, `${mime} refused with ${error.status}`);
          return true;
        },
        `${mime} was not refused`,
      );
    }
  });

  it('refuses a payload over the size ceiling before it crosses the wire', async () => {
    await assert.rejects(
      () => uploadImage(dataUri('image/jpeg', MAX_UPLOAD_BYTES + 1024), { folder: 'sopii/test' }),
      (error: InstanceType<typeof CloudinaryError>) => {
        assert.equal(error.status, 413);
        return true;
      },
    );
  });

  it('refuses a string that is neither a data URI nor an http(s) URL', async () => {
    for (const source of ['file:///etc/passwd', 'ftp://example.com/a.jpg', 'just some text']) {
      await assert.rejects(
        () => uploadImage(source, { folder: 'sopii/test' }),
        (error: InstanceType<typeof CloudinaryError>) => error.status === 400,
        `${source} was not refused`,
      );
    }
  });

  it('refuses a malformed data URI rather than passing it on', async () => {
    await assert.rejects(
      () => uploadImage('data:image/jpeg,not-base64-at-all', { folder: 'sopii/test' }),
      (error: InstanceType<typeof CloudinaryError>) => error.status === 400,
    );
  });
});

/* ------------------------------ size maths --------------------------------- */

describe('uploads: decoded size', () => {
  it('measures the decoded bytes, not the base64 length', () => {
    // base64 is 4 characters per 3 bytes; billing and the ceiling are both
    // about the decoded size.
    assert.equal(dataUriBytes(dataUri('image/jpeg', 300)), 300);
    assert.equal(dataUriBytes(dataUri('image/png', 1)), 1);
    assert.equal(dataUriBytes(dataUri('image/webp', 2)), 2);
  });

  it('accounts for padding, so a size is never over-reported', () => {
    for (const bytes of [1, 2, 3, 4, 5, 6, 1023, 1024]) {
      assert.equal(dataUriBytes(dataUri('image/jpeg', bytes)), bytes, `${bytes} bytes mis-measured`);
    }
  });

  it('recognises the payloads the migration exists to remove', () => {
    assert.equal(isDataUri('data:image/png;base64,AAAA'), true);
    assert.equal(isDataUri(CLOUD), false);
    assert.equal(isDataUri(null), false);
    assert.equal(isDataUri(undefined), false);
  });
});

/* ---------------------------- delivery URLs -------------------------------- */

describe('images: rewriting a delivery URL (§7)', () => {
  it('recognises a Cloudinary URL and nothing else', () => {
    assert.equal(isCloudinaryUrl(CLOUD), true);
    assert.equal(isCloudinaryUrl('https://evil.example/res.cloudinary.com/x.jpg'), false);
    assert.equal(isCloudinaryUrl('/media/products/a.jpg'), false);
    assert.equal(isCloudinaryUrl(''), false);
    assert.equal(isCloudinaryUrl(null), false);
  });

  it('inserts the preset transformation', () => {
    const out = withTransform(CLOUD, 'card');
    assert.ok(out.includes('/image/upload/f_auto,q_auto,c_fill,g_auto,w_600,h_750,dpr_auto/'));
    assert.ok(out.endsWith('sopii/products/prd_1/main.jpg'));
  });

  it('keeps the version segment, which is not a transformation', () => {
    assert.ok(withTransform(CLOUD, 'thumb').includes('/v1712345678/'));
  });

  it('replaces an existing transformation rather than stacking one', () => {
    // Applied twice by two layers, this has to land on one transformation —
    // stacked segments produce a URL Cloudinary reads differently.
    const once = withTransform(CLOUD, 'card');
    const twice = withTransform(once, 'card');

    assert.equal(twice, once, 'the transformation stacked instead of replacing');
    assert.equal((twice.match(/f_auto/g) ?? []).length, 1);
  });

  it('re-presets an already-transformed URL to the size the caller asked for', () => {
    const card = withTransform(CLOUD, 'card');
    const thumb = withTransform(card, 'thumb');

    assert.ok(thumb.includes('w_200,h_250'));
    assert.ok(!thumb.includes('w_600'), 'the previous width survived');
  });

  it('passes a non-Cloudinary URL through untouched', () => {
    // What makes it safe to wrap every image field during the migration.
    for (const url of ['/media/products/a.jpg', 'https://example.com/a.jpg', 'data:image/png;base64,AA']) {
      assert.equal(withTransform(url, 'card'), url);
    }
  });

  it('answers an empty string for nothing, never "undefined" in an src', () => {
    assert.equal(withTransform(null), '');
    assert.equal(withTransform(undefined), '');
    assert.equal(withTransform('   '), '');
  });

  it('defaults to format and quality only, with no resize', () => {
    const out = withTransform(CLOUD);
    assert.ok(out.includes('/f_auto,q_auto/'));
    assert.ok(!out.includes('w_'), 'the default preset resized the image');
  });
});

/* ------------------------------ derived ids -------------------------------- */

describe('images: derived public ids', () => {
  it('lands on the same id for the same bytes, so a half-run migration resumes', () => {
    const source = 'data:image/png;base64,AAAABBBB';
    assert.equal(derivedPublicId('prd_1', source), derivedPublicId('prd_1', source));
  });

  it('separates different bytes and different records', () => {
    assert.notEqual(derivedPublicId('prd_1', 'a'), derivedPublicId('prd_1', 'b'));
    assert.notEqual(derivedPublicId('prd_1', 'a'), derivedPublicId('prd_2', 'a'));
  });

  it('emits a public id safe to put in a URL path', () => {
    // A product id is operator-supplied, so it reaches this unsanitised. Path
    // separators and whitespace must not survive into a delivery URL.
    const id = derivedPublicId('prd 1/../etc', 'bytes');

    assert.match(id, /^[A-Za-z0-9._-]+$/, `unsafe characters survived: ${id}`);
    assert.ok(!id.includes('/'), 'a path separator survived');
    assert.ok(!id.includes(' '), 'whitespace survived');
  });

  it('caps the length, so a pathological id cannot build an unbounded key', () => {
    assert.ok(derivedPublicId('x'.repeat(500), 'bytes').length <= 64 + 1 + 12);
  });
});
