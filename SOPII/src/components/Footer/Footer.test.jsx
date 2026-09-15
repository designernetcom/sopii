import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { Footer } from './Footer';
import { SocialRail } from '../SocialRail/SocialRail';
import { adaptFooter, isSafeFooterHref } from '../../services/adapters';
import { FOOTER } from '../../data/site';

/*
 * The footer's contract.
 * ===========================================================================
 * Everything in it comes from the admin panel's Footer screen, so what is
 * pinned here is the mapping from that feed to the page: sections render in
 * the order sent, only what was sent renders, each kind of section lands in
 * its place, and a link can only ever be a link. The store's own contact
 * details still come from Settings.
 */

const mockCatalog = vi.hoisted(() => ({
  footer: null,
  settings: {
    brand: {
      name: 'SOPII',
      email: 'care@example.com',
      phone: '+91 81052 92614',
      address: 'Studio 4, Kala Ghoda, Mumbai',
      whatsapp: '',
    },
  },
}));

vi.mock('../../context/CatalogContext', () => ({
  useFooter: () => mockCatalog.footer,
  useSiteSettings: () => mockCatalog.settings,
}));

const link = (id, label, url, extra = {}) => ({ id, label, url, openInNewTab: false, ...extra });

/** A footer as the API sends it, run through the same adapter the shop uses. */
const feed = (sections, socialLinks = []) => adaptFooter({ sections, socialLinks });

const renderFooter = () =>
  render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );

beforeEach(() => {
  mockCatalog.footer = adaptFooter(FOOTER);
});

describe('Footer', () => {
  it('renders the default footer: columns, quick links, badges, policies and credit', () => {
    renderFooter();

    for (const name of ['Shop', 'Customer Care', 'About SOPII']) {
      expect(screen.getByRole('navigation', { name })).toBeInTheDocument();
    }
    // Once in Customer Care, once in the quick links — as the footer always had it.
    expect(screen.getAllByRole('link', { name: 'Track Order' })).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Help Centre' })).toBeInTheDocument();
    expect(screen.getByText('We Accept')).toBeInTheDocument();
    expect(screen.getByText('RuPay')).toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: 'Policies' })).getAllByRole('link'),
    ).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'Netcom Business Solutions Pvt Ltd' })).toHaveAttribute(
      'target',
      '_blank',
    );
  });

  it('renders what the panel sent, not hard-coded columns', () => {
    mockCatalog.footer = feed([
      { id: 's1', type: 'links', title: 'Help', items: [link('i1', 'Size Guide', '/pages/size-guide')] },
    ]);
    renderFooter();

    const nav = screen.getByRole('navigation', { name: 'Help' });
    expect(within(nav).getByRole('link', { name: 'Size Guide' })).toHaveAttribute(
      'href',
      '/pages/size-guide',
    );
    expect(screen.queryByRole('navigation', { name: 'Shop' })).not.toBeInTheDocument();
    expect(screen.queryByText('We Accept')).not.toBeInTheDocument();
    expect(screen.queryByText(/All Rights Reserved/)).not.toBeInTheDocument();
  });

  it('keeps the order the panel set', () => {
    mockCatalog.footer = feed([
      { id: 'b', type: 'links', title: 'Second', items: [link('b1', 'B', '/b')] },
      { id: 'a', type: 'links', title: 'First', items: [link('a1', 'A', '/a')] },
    ]);
    renderFooter();

    expect(screen.getAllByRole('navigation').map((nav) => nav.getAttribute('aria-label'))).toEqual([
      'Second',
      'First',
    ]);
  });

  it('opens external and new-tab links safely, and routes site paths', () => {
    mockCatalog.footer = feed([
      {
        id: 's',
        type: 'links',
        title: 'Links',
        items: [
          link('i1', 'Story', '/pages/our-story'),
          link('i2', 'Blog', 'https://blog.example.com', { openInNewTab: true }),
          link('i3', 'Email us', 'mailto:care@example.com'),
        ],
      },
    ]);
    renderFooter();

    expect(screen.getByRole('link', { name: 'Story' })).not.toHaveAttribute('target');
    const blog = screen.getByRole('link', { name: 'Blog' });
    expect(blog).toHaveAttribute('target', '_blank');
    expect(blog).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'Email us' })).toHaveAttribute(
      'href',
      'mailto:care@example.com',
    );
  });

  it('never renders a script link, even if the feed carries one', () => {
    mockCatalog.footer = feed([
      {
        id: 's',
        type: 'links',
        title: 'Links',
        items: [link('bad', 'Evil', 'javascript:alert(1)'), link('ok', 'Fine', '/fine')],
      },
    ]);
    renderFooter();

    expect(screen.queryByText('Evil')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fine' })).toBeInTheDocument();
  });

  it('fills the copyright tokens with the year and the store name from Settings', () => {
    mockCatalog.footer = feed([
      { id: 'c', type: 'copyright', title: 'Copyright', content: '© {year} {store} Pvt Ltd' },
    ]);
    renderFooter();

    expect(screen.getByText(`© ${new Date().getFullYear()} SOPII Pvt Ltd`)).toBeInTheDocument();
  });

  it('shows only the contact details the brand section asks for', () => {
    mockCatalog.footer = feed([
      {
        id: 'brand',
        type: 'brand',
        title: 'Brand',
        content: 'Handwoven in India.',
        display: { logo: false, address: true, email: true, phone: false },
      },
    ]);
    renderFooter();

    expect(screen.getByText('Handwoven in India.')).toBeInTheDocument();
    expect(screen.getByText('Studio 4, Kala Ghoda, Mumbai')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'care@example.com' })).toBeInTheDocument();
    expect(screen.queryByText('+91 81052 92614')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /logo/ })).not.toBeInTheDocument();
  });

  it('leaves out a section with nothing to show', () => {
    mockCatalog.footer = feed([
      { id: 'empty', type: 'links', title: 'Empty', items: [] },
      { id: 'text', type: 'text', title: 'Blank', content: '   ' },
    ]);
    renderFooter();

    expect(screen.queryByText('Empty')).not.toBeInTheDocument();
    expect(screen.queryByText('Blank')).not.toBeInTheDocument();
  });

  it('renders a social column with the channels it was given', () => {
    mockCatalog.footer = feed([
      {
        id: 'social',
        type: 'social',
        title: 'Follow Us',
        items: [link('ig', 'Instagram', 'https://instagram.com/x', { icon: 'Instagram', openInNewTab: true })],
      },
    ]);
    renderFooter();

    const nav = screen.getByRole('navigation', { name: 'Follow Us' });
    expect(within(nav).getByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'href',
      'https://instagram.com/x',
    );
  });

  it('puts quick links, copyright and payments in one row only when they are adjacent', () => {
    mockCatalog.footer = feed([
      { id: 'u', type: 'utility', title: 'Quick', items: [link('t', 'Track', '/orders', { icon: 'Package' })] },
      { id: 'l', type: 'legal', title: 'Policies', items: [link('p', 'Privacy', '/pages/privacy')] },
      { id: 'c', type: 'copyright', title: 'Copyright', content: '© {store}' },
    ]);
    renderFooter();

    const track = screen.getByRole('link', { name: 'Track' });
    const copyright = screen.getByText('© SOPII');
    // Separated by the policies line, so they are in different rows.
    expect(track.closest('.container-site')).not.toBe(copyright.closest('.container-site'));
  });

  it('renders only the seam and spacer when every section is hidden', () => {
    mockCatalog.footer = feed([]);
    renderFooter();

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('SocialRail', () => {
  it('shows the footer feed’s social channels', () => {
    mockCatalog.footer = feed(
      [],
      [link('yt', 'YouTube', 'https://youtube.com/@sopii', { icon: 'Youtube', color: '#FF0000' })],
    );
    render(<SocialRail />);

    const rail = screen.getByRole('navigation');
    expect(within(rail).getByRole('link', { name: 'YouTube' })).toHaveAttribute(
      'href',
      'https://youtube.com/@sopii',
    );
  });
});

describe('adaptFooter', () => {
  it('returns null for a payload without a footer, so the bundled one can stand in', () => {
    expect(adaptFooter(undefined)).toBeNull();
    expect(adaptFooter({})).toBeNull();
  });

  it('keeps an empty section list — the panel hid everything', () => {
    expect(adaptFooter({ sections: [] })).toEqual({ sections: [], socialLinks: [] });
  });

  it('drops unknown section types and blank labels', () => {
    const out = adaptFooter({
      sections: [
        { id: 'x', type: 'marquee', items: [] },
        { id: 'y', type: 'links', title: 'Y', items: [link('a', '  ', '/a'), link('b', 'B', '/b')] },
      ],
    });
    expect(out.sections.map((section) => section.id)).toEqual(['y']);
    expect(out.sections[0].items.map((item) => item.label)).toEqual(['B']);
  });
});

describe('isSafeFooterHref', () => {
  it.each(['/pages/faq', 'https://netcom-india.com/', 'mailto:a@b.co', 'tel:+918105292614'])(
    'allows %s',
    (url) => expect(isSafeFooterHref(url)).toBe(true),
  );

  it.each(['javascript:alert(1)', ' JAVASCRIPT:alert(1)', 'data:text/html,x', '//evil.example', 'evil.example', ''])(
    'refuses %s',
    (url) => expect(isSafeFooterHref(url)).toBe(false),
  );
});
