import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { AnnouncementBar } from './AnnouncementBar';

/*
 * The announcement strip's contract.
 * ===========================================================================
 * The motion is CSS, which jsdom does not run — so what is asserted here is
 * the structure the CSS depends on, because that is where a seamless loop
 * actually breaks:
 *
 *  - the track must hold an even number of *identical* sequences, or the
 *    -50% → 0 keyframes land on a different picture and the restart jumps;
 *  - each half must be at least as wide as the bar, or a short message on a
 *    wide screen scrolls past a blank run;
 *  - no JavaScript timer may drive it — the old bar rotated on setInterval.
 *
 * And the copy itself: it comes from the catalogue (the admin panel's feed),
 * is read once by assistive tech, and the bar disappears when there is none.
 */

const mockCatalog = vi.hoisted(() => ({ announcements: [] }));

vi.mock('../../context/CatalogContext', () => ({
  useCatalog: () => mockCatalog,
}));

const ANNOUNCEMENTS = [
  { id: 'ann_1', message: 'Free shipping on orders above ₹1999' },
  { id: 'ann_2', message: 'Handcrafted in India' },
];

/** The CSS reading speed the component is tuned to, in px per second. */
const SPEED = 40;

const track = () => document.querySelector('.announcement-bar__track');
const sequences = () => [...track().children];

/**
 * jsdom lays nothing out, so every box is 0×0. Give the bar, a sequence and a
 * message real widths — the only measurements the component takes. A message
 * starts where its sequence starts, as it does in the real layout.
 */
function mockWidths({ viewport, sequence, message = 100 }) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
    let width = 0;
    if (this.classList.contains('announcement-bar')) width = viewport;
    if (this.classList.contains('announcement-bar__sequence')) width = sequence;
    if (this.classList.contains('announcement-bar__message')) width = message;
    return { width, height: 36, top: 0, left: 0, right: width, bottom: 36, x: 0, y: 0 };
  });
}

/**
 * Where every copy of the first message is centred on the first painted frame,
 * worked out from the styles the component actually set — not from its own
 * formula, so a wrong formula cannot pass by agreeing with itself.
 */
function firstFrameCentres({ sequence, messageCentre }) {
  const duration = parseFloat(track().style.animationDuration);
  const elapsed = -parseFloat(track().style.animationDelay);
  const half = (sequences().length / 2) * sequence;
  // translateX(-50%) → 0 over `duration`, linear.
  const trackX = -half + (elapsed / duration) * half;
  return sequences().map((_, copy) => trackX + copy * sequence + messageCentre);
}

const isCentred = (centres, viewport) =>
  centres.some((centre) => Math.abs(centre - viewport / 2) < 0.1);

beforeEach(() => {
  mockCatalog.announcements = ANNOUNCEMENTS;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('AnnouncementBar', () => {
  it('renders nothing when there are no live announcements', () => {
    mockCatalog.announcements = [];
    const { container } = render(<AnnouncementBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the messages it was given, not hard-coded copy', () => {
    mockCatalog.announcements = [{ id: 'x', message: 'Monsoon sale is live' }];
    render(<AnnouncementBar />);

    const region = screen.getByRole('region', { name: 'Announcements' });
    expect(within(region).getByRole('listitem')).toHaveTextContent('Monsoon sale is live');
    expect(region).not.toHaveTextContent(/no returns|handcrafted/i);
  });

  it('exposes each message to assistive tech exactly once, in order', () => {
    render(<AnnouncementBar />);

    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(ANNOUNCEMENTS.map((a) => a.message));
    // The repeated copies scroll past, so they must not be read out again.
    expect(track()).toHaveAttribute('aria-hidden', 'true');
  });

  it('builds the track from two identical halves', () => {
    mockWidths({ viewport: 1000, sequence: 300 });
    render(<AnnouncementBar />);

    const all = sequences();
    expect(all.length % 2).toBe(0);
    all.forEach((sequence) => expect(sequence.textContent).toBe(all[0].textContent));
  });

  it('repeats the sequence until each half covers the bar', () => {
    // 1000 / 300 → 4 copies per half, so 8 in the track.
    mockWidths({ viewport: 1000, sequence: 300 });
    render(<AnnouncementBar />);

    const all = sequences();
    expect(all).toHaveLength(8);
    expect(all.length / 2 * 300).toBeGreaterThanOrEqual(1000);
  });

  it('does not repeat long copy that already fills the bar', () => {
    mockWidths({ viewport: 400, sequence: 1200 });
    render(<AnnouncementBar />);
    expect(sequences()).toHaveLength(2);
  });

  it('scales the duration with the distance, so speed is constant', () => {
    mockWidths({ viewport: 1000, sequence: 300 });
    render(<AnnouncementBar />);
    // One cycle moves one half: 4 × 300px at SPEED px/s.
    expect(track().style.animationDuration).toBe(`${(4 * 300) / SPEED}s`);
  });

  it('starts with the first announcement centred in the bar', () => {
    mockWidths({ viewport: 1000, sequence: 300, message: 120 });
    render(<AnnouncementBar />);

    expect(isCentred(firstFrameCentres({ sequence: 300, messageCentre: 60 }), 1000)).toBe(true);
  });

  it('starts inside the first cycle, so the loop is already running at load', () => {
    mockWidths({ viewport: 1000, sequence: 300, message: 120 });
    render(<AnnouncementBar />);

    const delay = parseFloat(track().style.animationDelay);
    const duration = parseFloat(track().style.animationDuration);
    expect(delay).toBeLessThanOrEqual(0);
    expect(-delay).toBeLessThan(duration);
  });

  it('centres on a phone-width bar', () => {
    mockWidths({ viewport: 375, sequence: 520, message: 260 });
    render(<AnnouncementBar />);

    expect(isCentred(firstFrameCentres({ sequence: 520, messageCentre: 130 }), 375)).toBe(true);
  });

  it('centres a message wider than the bar itself', () => {
    // Both ends are clipped; its middle is still the middle of the bar.
    mockWidths({ viewport: 400, sequence: 1200, message: 1100 });
    render(<AnnouncementBar />);

    expect(isCentred(firstFrameCentres({ sequence: 1200, messageCentre: 550 }), 400)).toBe(true);
  });

  it('ignores the trailing letter-spacing when finding the centre', () => {
    /* The strip is set in wide tracking, which adds space after the last
       glyph too. Centring the text *box* would put the visible word 1px off. */
    mockWidths({ viewport: 1000, sequence: 300, message: 122 });
    const realGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const style = realGetComputedStyle(element, pseudo);
      if (!element.classList?.contains('announcement-bar__message')) return style;
      return new Proxy(style, {
        get: (target, key) => (key === 'letterSpacing' ? '2px' : target[key]),
      });
    });

    render(<AnnouncementBar />);

    // 122px box, 2px of it trailing tracking → glyphs centred at 60px.
    expect(isCentred(firstFrameCentres({ sequence: 300, messageCentre: 60 }), 1000)).toBe(true);
  });

  it('keeps message order within every copy', () => {
    render(<AnnouncementBar />);
    const items = [...sequences()[0].querySelectorAll('.announcement-bar__item')];
    expect(items.map((item) => item.firstChild.textContent)).toEqual(
      ANNOUNCEMENTS.map((a) => a.message),
    );
  });

  it('marks every copy after the first, so reduced motion can show just one', () => {
    render(<AnnouncementBar />);
    const [first, ...rest] = sequences();
    expect(first).not.toHaveAttribute('data-clone');
    rest.forEach((sequence) => expect(sequence).toHaveAttribute('data-clone'));
  });

  it('uses no JavaScript timers to animate', () => {
    vi.useFakeTimers();
    render(<AnnouncementBar />);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows the new copy when the admin edits it', () => {
    const { rerender } = render(<AnnouncementBar />);

    mockCatalog.announcements = [{ id: 'ann_1', message: 'Free shipping on orders above ₹2499' }];
    rerender(<AnnouncementBar />);

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Free shipping on orders above ₹2499',
    ]);
    expect(track()).not.toHaveTextContent('₹1999');
  });

  it('disappears when the last announcement is switched off', () => {
    const { rerender, container } = render(<AnnouncementBar />);

    mockCatalog.announcements = [];
    rerender(<AnnouncementBar />);

    expect(container).toBeEmptyDOMElement();
  });
});
