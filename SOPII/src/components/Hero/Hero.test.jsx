import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

import { Hero } from './Hero';

/*
 * The hero carousel's autoplay contract.
 * ===========================================================================
 * The cadence is the whole feature here, and it is the kind of thing that
 * breaks silently: nothing throws when an interval is 6.5s instead of 2s, when
 * a manual tap leaves the old timer running alongside the new one, or when an
 * unmounted carousel keeps calling `setIndex` forever. None of that is visible
 * in a screenshot either — it needs a clock you can advance.
 *
 * `aria-hidden` is the assertion surface rather than a class string: every
 * slide is mounted all the time so they can cross-fade, so "which slide is
 * showing" is only expressed by that attribute (and `aria-current` on the
 * matching dot). Asserting on opacity classes instead would pass just as
 * happily with the fade broken.
 */

/* The component reads its slides from the catalog, which in the real app is an
   API bootstrap. Three slides is what the homepage actually ships
   (HERO_SLIDE_COUNT), and three is also the smallest number that can tell
   "advances" apart from "wraps". */
const SLIDES = [
  { id: 'a', eyebrow: 'One', image: '/media/a.jpg', seed: 1, tags: 'x' },
  { id: 'b', eyebrow: 'Two', image: '/media/b.jpg', seed: 2, tags: 'y' },
  { id: 'c', eyebrow: 'Three', image: '/media/c.jpg', seed: 3, tags: 'z' },
];

const mockCatalog = vi.hoisted(() => ({ heroSlides: [] }));

vi.mock('../../context/CatalogContext', () => ({
  useCatalog: () => mockCatalog,
}));

/*
 * Index of the one slide not hidden from assistive tech.
 *
 * `hidden: true` is load-bearing: the inactive slides carry `aria-hidden`, so
 * the default query drops them from the accessibility tree and would return a
 * one-element list whose only member is always at index 0 — i.e. it would
 * report "slide 0" no matter what the carousel was doing.
 */
function visibleSlide() {
  const slides = screen.getAllByRole('group', { hidden: true });
  return slides.findIndex((s) => s.getAttribute('aria-hidden') === 'false');
}

/** Advance the fake clock inside `act`, so React flushes the state update. */
function tick(ms) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  mockCatalog.heroSlides = SLIDES;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Hero autoplay', () => {
  it('advances to the next slide every 2 seconds', () => {
    render(<Hero />);
    expect(visibleSlide()).toBe(0);

    tick(2000);
    expect(visibleSlide()).toBe(1);

    tick(2000);
    expect(visibleSlide()).toBe(2);
  });

  it('does not advance early', () => {
    // Guards the cadence from below: a 1.5s interval would also pass the test
    // above, because that one only ever looks after a full 2s has elapsed.
    render(<Hero />);

    tick(1999);
    expect(visibleSlide()).toBe(0);

    tick(1);
    expect(visibleSlide()).toBe(1);
  });

  it('wraps from the last slide back to the first', () => {
    render(<Hero />);

    tick(2000 * SLIDES.length);
    expect(visibleSlide()).toBe(0);

    // And keeps going rather than stalling on the seam.
    tick(2000);
    expect(visibleSlide()).toBe(1);
  });

  it('runs continuously over many cycles', () => {
    render(<Hero />);

    for (let i = 1; i <= 10; i += 1) {
      tick(2000);
      expect(visibleSlide()).toBe(i % SLIDES.length);
    }
  });

  it('restarts the countdown when the visitor picks a slide', () => {
    render(<Hero />);

    // 1.5s into the first slide's turn, jump to the third.
    tick(1500);
    act(() => {
      screen.getByRole('button', { name: /go to slide 3/i }).click();
    });
    expect(visibleSlide()).toBe(2);

    /* The remaining 500ms of the original cycle must not advance it — that
       would read as the carousel overriding the tap. */
    tick(1900);
    expect(visibleSlide()).toBe(2);

    // A full 2s from the tap, and only then, it moves on and wraps.
    tick(100);
    expect(visibleSlide()).toBe(0);
  });

  it('keeps the dots in step with the slide', () => {
    render(<Hero />);
    const current = () =>
      screen
        .getAllByRole('button', { name: /go to slide/i })
        .findIndex((b) => b.getAttribute('aria-current') === 'true');

    expect(current()).toBe(0);

    tick(2000);
    expect(current()).toBe(1);
  });

  it('stops the timer on unmount', () => {
    const { unmount } = render(<Hero />);
    const cleared = vi.spyOn(globalThis, 'clearInterval');

    unmount();
    expect(cleared).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives the first slide a high fetch priority in the DOM', () => {
    /*
     * The hero image is the page's LCP, so the hint is the point of the prop.
     * Asserted on the rendered attribute rather than the prop because that is
     * exactly where it went wrong: React 18 silently drops a camelCase
     * `fetchPriority`, so the JSX looked correct while the DOM had nothing.
     */
    render(<Hero />);
    const images = document.querySelectorAll('.hero-frame img');

    expect(images[0]).toHaveAttribute('fetchpriority', 'high');
    expect(images[1]).toHaveAttribute('fetchpriority', 'low');
  });

  it('does not run a timer for a single slide', () => {
    // Nothing to advance to, so scheduling one would be pure wakeup cost.
    mockCatalog.heroSlides = SLIDES.slice(0, 1);
    render(<Hero />);

    expect(vi.getTimerCount()).toBe(0);
    expect(screen.queryByRole('button', { name: /go to slide/i })).toBeNull();
  });
});
