import { useLayoutEffect, useRef, useState } from 'react';
import { useCatalog } from '../../context/CatalogContext';

/**
 * Thin strip above the header, carrying the announcements published from the
 * admin panel (Homepage → Announcements).
 *
 * The copy scrolls continuously left → right as one seamless loop. How that
 * loop is built, because it is easy to get subtly wrong:
 *
 *   track:  [ half A ][ half B ]         half = the sequence × `copies`
 *   motion: translateX(-50%) → translateX(0), linear, infinite
 *
 * The two halves are identical, so the last frame (half A in view) looks
 * exactly like the first (half B in view) and the restart is invisible. The
 * seam is exact to the sub-pixel because -50% is measured from the track's own
 * width rather than from a number JavaScript rounded.
 *
 * Three things are measured, on mount and on resize (including when a web font
 * lands and the text changes width) — never per frame:
 *
 *  - `copies`: each half has to be at least as wide as the bar, or a short
 *    message on a wide screen leaves a blank run before the next repeat.
 *  - `duration`: one cycle travels one half, so the reading speed is constant
 *    however much copy there is.
 *  - `delay`: a negative animation delay that starts the loop part-way through,
 *    at the exact point where the first announcement sits centred in the bar.
 *    Any starting point is as seamless as any other, so this costs nothing.
 *
 * The motion itself is a CSS transform on the compositor, with no timers and
 * no React state involved.
 *
 * Loading needs nothing here: `CatalogGate` holds the page, and its skeleton
 * already draws a strip of the same height. With no live announcements — none
 * published, or the API unreachable — the bar is not rendered at all.
 */
export function AnnouncementBar() {
  const { announcements } = useCatalog();
  if (!announcements?.length) return null;
  return <AnnouncementMarquee announcements={announcements} />;
}

/** Constant reading speed, whatever the amount of copy. CSS pixels per second. */
const SPEED_PX_PER_SECOND = 40;

/**
 * Ceiling on repeats per half. The narrowest realistic sequence (one short
 * word plus its separator spacing) is ~60px, and 64 of those cover a 3840px
 * display; the cap exists so a degenerate measurement cannot mount thousands
 * of nodes.
 */
const MAX_COPIES = 64;

/** Seconds, to the millisecond: at 40px/s that is 0.04px — invisible — and it keeps state stable. */
const toMs = (seconds) => Math.round(seconds * 1000) / 1000;

/** Modulo that stays positive for a negative dividend. */
const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;

function AnnouncementMarquee({ announcements }) {
  const viewportRef = useRef(null);
  const sequenceRef = useRef(null);
  const [layout, setLayout] = useState({ copies: 1, duration: 0, delay: 0 });

  /* Changing the copy restarts the loop from its centred first frame. Letting
     it run on would change the track's width mid-cycle, which reads as a jump. */
  const signature = announcements.map(({ id, message }) => `${id}:${message}`).join('|');

  /*
   * A layout effect, so the first measurement lands before the first paint:
   * the bar never shows a frame with too few copies, the wrong speed, or the
   * copy anywhere but centred.
   */
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const sequence = sequenceRef.current;
    if (!viewport || !sequence) return undefined;

    const measure = () => {
      const viewportWidth = viewport.getBoundingClientRect().width;
      const sequenceRect = sequence.getBoundingClientRect();
      const sequenceWidth = sequenceRect.width;
      const firstMessage = sequence.querySelector('.announcement-bar__message');
      if (!sequenceWidth || !viewportWidth || !firstMessage) return;

      const copies = Math.min(MAX_COPIES, Math.max(1, Math.ceil(viewportWidth / sequenceWidth)));
      const duration = toMs((copies * sequenceWidth) / SPEED_PX_PER_SECOND);

      /*
       * Where the first message's visual centre sits within one sequence.
       * Letter-spacing is added after every glyph, the last one included, so
       * the text box carries one trailing space the eye does not see — half of
       * it is taken back, or "centred" is off by a pixel.
       */
      const messageRect = firstMessage.getBoundingClientRect();
      const letterSpacing = parseFloat(getComputedStyle(firstMessage).letterSpacing) || 0;
      const messageCentre =
        messageRect.left - sequenceRect.left + (messageRect.width - letterSpacing) / 2;

      /*
       * The phase that centres it. At elapsed time t the track sits at
       * -half + t·speed, and copy k of the message is centred when
       * -half + t·speed + k·sequence + messageCentre = viewport / 2.
       * Some whole k always solves that for a travel in [0, sequence), which
       * is this modulo — and because each half covers the bar, that k is a
       * copy that actually exists on the track.
       */
      const travel = mod(viewportWidth / 2 - messageCentre, sequenceWidth);
      const delay = -toMs(travel / SPEED_PX_PER_SECOND);

      setLayout((current) =>
        current.copies === copies && current.duration === duration && current.delay === delay
          ? current
          : { copies, duration, delay },
      );
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(sequence);
    return () => observer.disconnect();
  }, [signature]);

  const { copies, duration, delay } = layout;

  return (
    <section aria-label="Announcements" className="bg-black text-white">
      {/* What assistive tech reads: each message once, in order. The moving
          track repeats them, so it is hidden from the accessibility tree. */}
      <ul className="sr-only">
        {announcements.map(({ id, message }) => (
          <li key={id}>{message}</li>
        ))}
      </ul>

      <div ref={viewportRef} className="announcement-bar">
        <div
          key={signature}
          aria-hidden="true"
          className="announcement-bar__track"
          style={
            duration
              ? { animationDuration: `${duration}s`, animationDelay: `${delay}s` }
              : undefined
          }
        >
          {Array.from({ length: copies * 2 }, (_, index) => (
            <div
              key={index}
              ref={index === 0 ? sequenceRef : undefined}
              className="announcement-bar__sequence"
              data-clone={index > 0 ? '' : undefined}
            >
              {announcements.map(({ id, message }) => (
                <span
                  key={id}
                  className="announcement-bar__item text-xs font-medium uppercase tracking-[0.1em] sm:text-sm lg:text-base"
                >
                  <span className="announcement-bar__message" style={{ fontSize: '12px' }}>{message}</span>
                  <span className="announcement-bar__separator text-white/30">|</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
