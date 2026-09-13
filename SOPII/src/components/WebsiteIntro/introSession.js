/*
 * The launch screen's settings and session bookkeeping. Kept apart from the
 * component so the component file exports only a component (fast refresh
 * needs that) and the tests can read the same numbers the component runs on.
 */

export const INTRO_STORAGE_KEY = 'sopii:intro-seen';

/*
 * Milliseconds. `hold` is measured from the start of the entrance and must
 * outlast the last entrance keyframe in index.css (the tagline ends at
 * 1300ms); `exit` is handed to the CSS as `--intro-exit` so the two cannot
 * drift apart. Enter to gone is 2.2s.
 */
export const INTRO_TIMING = {
  full: { logoWait: 900, hold: 1450, exit: 750 },
  reduced: { logoWait: 400, hold: 600, exit: 300 },
};

/*
 * Storage that cannot be read (blocked cookies, some private modes) means the
 * intro could not remember it had played, and would replay on every reload.
 * Skipping it is the better failure: nobody misses an intro, but everybody
 * notices one that will not go away.
 */
export function shouldShowIntro() {
  try {
    return window.sessionStorage.getItem(INTRO_STORAGE_KEY) === null;
  } catch {
    return false;
  }
}

export function markIntroSeen() {
  try {
    window.sessionStorage.setItem(INTRO_STORAGE_KEY, '1');
  } catch {
    /* Unreachable in practice — shouldShowIntro already read successfully. */
  }
}

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
