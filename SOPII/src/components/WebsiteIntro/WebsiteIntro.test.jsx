import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

import { WebsiteIntro } from './WebsiteIntro';
import { INTRO_STORAGE_KEY, INTRO_TIMING } from './introSession';

/*
 * The launch screen's contract: it covers the page from the very first render,
 * walks its phases on a clock, gives the page back, and does all of that once
 * per session. jsdom never loads images, so every run exercises the
 * `logoWait` fallback — the path a slow connection takes.
 */

const { full, reduced } = INTRO_TIMING;
const intro = () => screen.queryByTestId('website-intro');

function mockReducedMotion(matches) {
  window.matchMedia = vi.fn().mockReturnValue({ matches });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
  document.body.style.overflow = '';
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  mockReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  document.getElementById('root')?.remove();
  delete window.matchMedia;
});

describe('WebsiteIntro', () => {
  it('covers the page on the first render, before any timer runs', () => {
    render(<WebsiteIntro />);

    expect(intro()).toHaveAttribute('data-phase', 'waiting');
    expect(screen.getByAltText('SOPII')).toBeInTheDocument();
    expect(screen.getByText('Elegance in Every Drape.')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.getElementById('root')).toHaveAttribute('inert');
  });

  it('enters, holds, exits and unmounts on schedule', () => {
    render(<WebsiteIntro />);

    act(() => vi.advanceTimersByTime(full.logoWait));
    expect(intro()).toHaveAttribute('data-phase', 'enter');

    act(() => vi.advanceTimersByTime(full.hold));
    expect(intro()).toHaveAttribute('data-phase', 'exit');
    /* The page is handed back as the veil starts to dissolve. */
    expect(document.body.style.overflow).toBe('');
    expect(document.getElementById('root')).not.toHaveAttribute('inert');

    act(() => vi.advanceTimersByTime(full.exit));
    expect(intro()).not.toBeInTheDocument();
  });

  it('starts the entrance as soon as the logo has loaded', () => {
    render(<WebsiteIntro />);

    act(() => screen.getByAltText('SOPII').dispatchEvent(new Event('load')));
    expect(intro()).toHaveAttribute('data-phase', 'enter');
  });

  it('plays once per session', () => {
    const { unmount } = render(<WebsiteIntro />);
    expect(window.sessionStorage.getItem(INTRO_STORAGE_KEY)).toBe('1');
    unmount();

    render(<WebsiteIntro />);
    expect(intro()).not.toBeInTheDocument();
    expect(document.getElementById('root')).not.toHaveAttribute('inert');
  });

  it('runs the short timeline when reduced motion is requested', () => {
    mockReducedMotion(true);
    render(<WebsiteIntro />);

    /* One `act` per phase: each phase's timer is only scheduled once the
       previous phase has rendered. */
    act(() => vi.advanceTimersByTime(reduced.logoWait));
    act(() => vi.advanceTimersByTime(reduced.hold));
    expect(intro()).toHaveAttribute('data-phase', 'exit');
    expect(intro().style.getPropertyValue('--intro-exit')).toBe(`${reduced.exit}ms`);

    act(() => vi.advanceTimersByTime(reduced.exit));
    expect(intro()).not.toBeInTheDocument();
  });

  it('stays out of the way when session storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    render(<WebsiteIntro />);
    expect(intro()).not.toBeInTheDocument();
  });
});
