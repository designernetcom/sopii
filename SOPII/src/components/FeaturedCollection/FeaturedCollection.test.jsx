import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { FeaturedCollection } from './FeaturedCollection';
import { adaptFeaturedCollection } from '../../services/adapters';

/*
 * The Featured Collection section's contract.
 * ===========================================================================
 * The copy is written in the admin panel and arrives in `/bootstrap` as
 * `featuredCollection`. Each test below starts from that payload and runs it
 * through the real adapter, so what is asserted is the whole storefront half of
 * the flow: API shape → adapter → rendered section.
 *
 * What must hold:
 *  - nothing on screen is hard-coded — change the payload, the page changes;
 *  - a hidden, missing or malformed section renders nothing and throws nothing;
 *  - optional parts disappear on their own, without leaving empty markup;
 *  - pillars are numbered by position, so hiding one leaves no gap;
 *  - a link that is not a shop path or an http(s) URL never becomes a button.
 */

const mockCatalog = vi.hoisted(() => ({ featuredCollection: null }));

vi.mock('../../context/CatalogContext', () => ({
  useCatalog: () => mockCatalog,
}));

/** What the API sends for a shown section, as `publicFeaturedCollection` builds it. */
const PAYLOAD = {
  enabled: true,
  eyebrow: 'The Festive Edit',
  heading: 'Silk for the season.\nCut for the day.',
  description: 'Handwoven for celebrations.',
  image: 'https://res.cloudinary.com/demo/image/upload/v1/sopii/banners/featured-collection/new.jpg',
  imageAlt: 'A festive silk drape',
  pillars: [
    { id: 'pil_a', title: 'Made to last', text: 'A decade of wear.' },
    { id: 'pil_b', title: 'Pure fibres', text: 'Nothing synthetic.' },
  ],
  cta: { text: 'Shop Festive', link: '/collections/festive-edit' },
};

function renderWith(payload) {
  mockCatalog.featuredCollection = adaptFeaturedCollection(payload);
  return render(
    <MemoryRouter>
      <FeaturedCollection />
    </MemoryRouter>,
  );
}

const section = () => document.querySelector('section[aria-labelledby="signature-heading"]');

beforeEach(() => {
  mockCatalog.featuredCollection = null;
});

describe('FeaturedCollection', () => {
  it('renders every part of the section from the payload', () => {
    renderWith(PAYLOAD);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveAttribute('id', 'signature-heading');
    expect(heading.innerHTML).toBe('Silk for the season.<br>Cut for the day.');
    expect(section()).toHaveAccessibleName('Silk for the season.Cut for the day.');

    expect(screen.getByText('The Festive Edit')).toHaveClass('eyebrow');
    expect(screen.getByText('Handwoven for celebrations.')).toBeInTheDocument();

    const image = screen.getByRole('img', { name: 'A festive silk drape' });
    expect(image.getAttribute('src')).toContain('/sopii/banners/featured-collection/new.jpg');
    expect(image).toHaveAttribute('sizes', '(min-width: 1024px) 50vw, 100vw');

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      '01Made to lastA decade of wear.',
      '02Pure fibresNothing synthetic.',
    ]);

    const cta = screen.getByRole('link', { name: 'Shop Festive' });
    expect(cta).toHaveAttribute('href', '/collections/festive-edit');
    expect(cta).not.toHaveAttribute('target');
    expect(cta).toHaveClass('btn-primary', 'group', 'mt-9');
  });

  it('shows none of the copy that used to be hard-coded', () => {
    renderWith(PAYLOAD);
    for (const text of ['SOPII Signature', 'Woven by hand', 'Explore Signature', 'Timeless silhouettes.']) {
      expect(screen.queryByText(text, { exact: false })).not.toBeInTheDocument();
    }
  });

  it('renders nothing when the section is hidden, missing or unusable', () => {
    for (const payload of [
      { enabled: false },
      undefined,
      null,
      'nonsense',
      { ...PAYLOAD, enabled: undefined },
      { ...PAYLOAD, heading: '  \n  ' },
    ]) {
      const { container, unmount } = renderWith(payload);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('leaves out the optional parts that are empty', () => {
    renderWith({ ...PAYLOAD, eyebrow: '', description: '  ', pillars: [], cta: null });

    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    expect(document.querySelector('.eyebrow')).toBeNull();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(section().querySelectorAll('p')).toHaveLength(0);
  });

  it('numbers pillars by position, skipping disabled and untitled ones, and omits empty text', () => {
    renderWith({
      ...PAYLOAD,
      pillars: [
        { id: 'a', title: 'First', text: '' },
        { id: 'b', title: 'Switched off', text: 'x', enabled: false },
        { id: 'c', title: '   ', text: 'No title' },
        { id: 'a', title: 'Repeated id', text: 'Still renders' },
        null,
      ],
    });

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['01First', '02Repeated idStill renders']);
    expect(items[0].querySelectorAll('p')).toHaveLength(0);
  });

  it('opens an absolute URL in a new tab and refuses links that are not safe', () => {
    const { unmount } = renderWith({ ...PAYLOAD, cta: { text: 'Lookbook', link: 'https://example.com/look' } });
    const external = screen.getByRole('link', { name: 'Lookbook' });
    expect(external).toHaveAttribute('href', 'https://example.com/look');
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');
    unmount();

    for (const link of ['javascript:alert(1)', '//evil.example', 'collections/x', '']) {
      const view = renderWith({ ...PAYLOAD, cta: { text: 'Go', link } });
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      view.unmount();
    }

    const view = renderWith({ ...PAYLOAD, cta: { text: '  ', link: '/shop' } });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    view.unmount();
  });

  it('stands in generated art and a sensible alt when the image or its description is missing', () => {
    renderWith({ ...PAYLOAD, image: '', imageAlt: '' });

    const image = screen.getByRole('img', { name: 'Silk for the season. Cut for the day.' });
    expect(image.getAttribute('src')).toBeTruthy();
    expect(image.getAttribute('src')).toBe(mockCatalog.featuredCollection.fallbackImage);
  });
});
