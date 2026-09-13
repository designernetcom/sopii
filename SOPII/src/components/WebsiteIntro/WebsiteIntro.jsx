import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import {
  INTRO_TIMING,
  markIntroSeen,
  prefersReducedMotion,
  shouldShowIntro,
} from './introSession';

/**
 * The launch screen — the SOPII wordmark and tagline, once per browser session.
 *
 * Phases, each driven by one timer so the whole sequence is a single, readable
 * state machine rather than a chain of `animationend` listeners (which never
 * fire in a background tab, and would strand the veil over the shop):
 *
 *   waiting -> the veil is up, the mark is not yet shown. Held only until the
 *              logo has decoded (capped by `logoWait`), so a cold load fades in
 *              a real wordmark instead of an empty box that pops in halfway.
 *   enter   -> the mark, rule and tagline ease in (CSS keyframes), then hold.
 *   exit    -> the content lifts away, then the veil dissolves onto the page.
 *   done    -> unmounted.
 *
 * The first render already contains the veil — the phase is decided in the
 * state initialiser, not an effect — so the homepage never paints uncovered.
 * Before React mounts, the document is an empty ivory body, which is the same
 * ground the veil paints.
 *
 * Rendered through a portal to <body> so it sits outside #root; that is what
 * lets #root be made `inert` while the veil is up, keeping keyboard focus off
 * the header links hidden beneath it.
 */
export function WebsiteIntro() {
  const [phase, setPhase] = useState(() => (shouldShowIntro() ? 'waiting' : 'done'));
  const [timing] = useState(() =>
    prefersReducedMotion() ? INTRO_TIMING.reduced : INTRO_TIMING.full,
  );
  const logoRef = useRef(null);

  /* Once the exit starts the page is interactive again — the veil stops
     taking pointer events and scroll is released, so a shopper who reaches
     for the page as it fades is not ignored. */
  const blocking = phase === 'waiting' || phase === 'enter';
  useLockBodyScroll(blocking);

  useEffect(() => {
    if (!blocking) return undefined;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    return () => root?.removeAttribute('inert');
  }, [blocking]);

  useEffect(() => {
    let next;
    let delay;

    if (phase === 'waiting') {
      /* Written on start rather than finish: a reload mid-intro should land
         on the shop, not replay the sequence. */
      markIntroSeen();
      const logo = logoRef.current;
      if (logo?.complete && logo.naturalWidth > 0) {
        setPhase('enter');
        return undefined;
      }
      [next, delay] = ['enter', timing.logoWait];
    } else if (phase === 'enter') {
      [next, delay] = ['exit', timing.hold];
    } else if (phase === 'exit') {
      [next, delay] = ['done', timing.exit];
    } else {
      return undefined;
    }

    const timer = window.setTimeout(() => setPhase(next), delay);
    return () => window.clearTimeout(timer);
  }, [phase, timing]);

  if (phase === 'done') return null;

  const logoReady = () => setPhase((current) => (current === 'waiting' ? 'enter' : current));

  return createPortal(
    <div
      className="site-intro"
      data-phase={phase}
      data-testid="website-intro"
      style={{ '--intro-exit': `${timing.exit}ms` }}
    >
      <div className="site-intro__content">
        <div className="site-intro__mark">
          <picture>
            <source
              type="image/webp"
              srcSet="/sopii-240.webp 240w, /sopii-480.webp 480w"
              sizes="(min-width: 640px) 340px, 62vw"
            />
            <img
              ref={logoRef}
              src="/sopii-480.png"
              srcSet="/sopii-240.png 240w, /sopii-480.png 480w"
              sizes="(min-width: 640px) 340px, 62vw"
              alt="SOPII"
              width={3132}
              height={1818}
              decoding="async"
              onLoad={logoReady}
              onError={logoReady}
            />
          </picture>
        </div>
        <span className="site-intro__rule" aria-hidden="true" />
        <p className="site-intro__tagline">Elegance in Every Drape.</p>
      </div>
    </div>,
    document.body,
  );
}
