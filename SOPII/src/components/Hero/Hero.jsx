import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../utils/cn';
import { photo } from '../../utils/images';
import { useCatalog } from '../../context/CatalogContext';

const INTERVAL = 6500;

/*
 * NOTE: the slide caption block (heading, body copy, CTA link) below is
 * commented out, so the hero currently renders imagery and controls only. The
 * `Link` and `ArrowRight` imports it used were removed with it — they were
 * shipping in every visitor's bundle for markup nothing rendered. Restoring
 * that block needs both imports back.
 */

/**
 * Full-bleed hero carousel.
 * Slides cross-fade with a slow Ken Burns zoom; autoplay pauses on hover,
 * on focus within, and whenever the tab is hidden.
 */
/*
 * The generated slide behind a banner with no image, or one that fails.
 *
 * Two shapes, for the same reason the real artwork has two: a 3:2 landscape
 * plate letterboxed into a phone-shaped box loses half its width to the crop.
 * The portrait version is what a phone gets.
 */
const slideArt = (slide) =>
  photo({ seed: slide.seed, tags: slide.tags, w: 1920, h: 1280 });
const slideArtMobile = (slide) =>
  photo({ seed: slide.seed, tags: slide.tags, w: 900, h: 1000 });

export function Hero() {
  /* Slides are the live banners from the admin panel's homepage section. */
  const { heroSlides: HERO_SLIDES } = useCatalog();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  /*
   * Ids whose mobile crop failed to load.
   *
   * `<picture>` has no automatic fallback: if the chosen `<source>` 404s the
   * browser shows a broken image rather than trying the `<img>` beneath it. So
   * a failed mobile asset is remembered and that `<source>` is dropped on the
   * next render, which lets the desktop crop take over.
   */
  const [mobileFailed, setMobileFailed] = useState(() => new Set());
  /** `"1.333 / 1"` etc., measured from the first slide once it decodes. */
  const [measuredRatio, setMeasuredRatio] = useState(null);
  const timer = useRef(null);

  const count = HERO_SLIDES.length;

  const goTo = useCallback(
    (i) => setIndex(((i % count) + count) % count),
    [count]
  );

  /**
   * Shapes the mobile frame to the first slide's artwork.
   *
   * Runs for the first slide only — the frame is shared, so it must not resize
   * as the carousel advances — and clamps the result between 0.75 (tall
   * portrait) and 1.5 (wide landscape), so an unusual banner cannot produce an
   * unusable hero.
   */
  const measureSlide = useCallback((event) => {
    const { naturalWidth: w, naturalHeight: h } = event.currentTarget;
    if (!w || !h) return;
    // 1.5 rather than the artwork's own 2:1 for a panorama: honouring that
    // literally leaves a 195px strip on a 390px screen. 1.5 keeps three
    // quarters of the width and still reads as a hero.
    const clamped = Math.min(1.5, Math.max(0.75, w / h));
    setMeasuredRatio(`${clamped.toFixed(3)} / 1`);
  }, []);

  /* The slides are live data, so a banner going out of window in the admin
     panel can shorten the list under a carousel that is already running. */
  useEffect(() => {
    setIndex((i) => (i >= count ? 0 : i));
  }, [count]);

  useEffect(() => {
    if (paused || count < 2) return undefined;
    timer.current = setInterval(
      () => setIndex((i) => (i + 1) % count),
      INTERVAL
    );
    return () => clearInterval(timer.current);
  }, [paused, index, count]);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const current = HERO_SLIDES[index] ?? HERO_SLIDES[0];
  if (!current) return null;

  /*
   * The shape of the mobile frame, taken from the artwork that will fill it.
   *
   * Guessing from whether a `mobileImage` exists is not good enough: a store
   * can put the same landscape plate in both banner fields, and a landscape
   * banner in a portrait box loses 60% of its width. So the frame follows the
   * artwork's real dimensions once they are known, falling back to a guess only
   * for the moment before the first slide decodes.
   */
  const mobileRatio =
    measuredRatio ?? (HERO_SLIDES[0]?.mobileImage ? '3 / 4' : '5 / 4');

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured collections"
      className="relative overflow-hidden bg-charcoal"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/*
        `.hero-frame` (index.css) sizes this box from `--hero-ratio`.

        On a phone the shape comes from the banner artwork rather than from the
        viewport height, so the same crop appears on every handset instead of
        being nearly square on a short one and letterboxed on a tall one. It is
        still capped against the viewport height so it cannot take the whole
        first screen, and `dvh` (with a `vh` fallback) keeps it from resizing
        when the address bar collapses.

        Desktop proportions are unchanged.
      */}
      <div className="hero-frame relative w-full" style={{ '--hero-ratio': mobileRatio }}>
        {HERO_SLIDES.map((slide, i) => {
          const active = i === index;
          /* The phone crop the panel supplied, or generated art shaped for a
             phone when the banner has no imagery at all. */
          const mobileSrc =
            slide.mobileImage || (slide.image ? null : slideArtMobile(slide));
          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${HERO_SLIDES.length}: ${slide.eyebrow}`}
              aria-hidden={!active}
              className={cn(
                'absolute inset-0 transition-opacity duration-[1200ms] ease-silk',
                active ? 'opacity-100' : 'pointer-events-none opacity-0'
              )}
            >
              {/*
                Art direction, not just scaling.

                The admin panel already stores two crops per banner —
                `desktopImage` and `mobileImage` — and the adapter passes both
                through; this is the first place that actually uses the second
                one. A phone gets the crop that was composed for a phone, and
                falls back to the desktop plate (and then to generated art) when
                the store has not supplied one.

                Scaling the landscape plate down is not a substitute: at 390px
                a 3:2 banner in this box loses nearly half its width to
                `object-cover`, which is how a model ends up half out of frame.
              */}
              <picture>
                {mobileSrc && !mobileFailed.has(slide.id) ? (
                  <source media="(max-width: 639px)" srcSet={mobileSrc} />
                ) : null}
                <img
                  src={slide.image || slideArt(slide)}
                  onError={(e) => {
                    /*
                     * Which of the two failed is not reported, so the mobile
                     * source is retired first — below `sm` that is the one in
                     * use — and the desktop plate gets a turn. If that fails
                     * too the generated slide takes over.
                     */
                    if (mobileSrc && !mobileFailed.has(slide.id)) {
                      setMobileFailed((current) =>
                        new Set(current).add(slide.id)
                      );
                      return;
                    }
                    const art = slideArt(slide);
                    if (e.currentTarget.src !== art) e.currentTarget.src = art;
                  }}
                  alt=""
                  aria-hidden="true"
                  loading={i === 0 ? 'eager' : 'lazy'}
                  onLoad={i === 0 ? measureSlide : undefined}
                  fetchPriority={i === 0 ? 'high' : 'low'}
                  decoding={i === 0 ? 'sync' : 'async'}
                  /* One slide always fills the frame, at every width. */
                  sizes="100vw"
                  /*
                   * `object-position` is raised on phones. A landscape banner
                   * cropped into a taller box loses the top and bottom equally
                   * by default, which is where the garment and the model's face
                   * usually are; biasing the crop upward keeps the subject in
                   * frame. A supplied mobile crop is already composed, so it is
                   * centred like the desktop one.
                   */
                  className={cn(
                    'h-full w-full object-cover transition-transform duration-[9000ms] ease-linear motion-reduce:transform-none sm:object-center',
                    mobileSrc && !mobileFailed.has(slide.id)
                      ? 'object-center'
                      : 'object-[50%_35%]',
                    /* The Ken Burns drift is desktop-only: a nine-second
                       compositor animation buys nothing at this size and costs
                       battery on every visit. */
                    active ? 'sm:scale-105' : 'sm:scale-100'
                  )}
                />
              </picture>
              {/* Scrim keeps the copy legible over any photograph */}
              <div className="absolute inset-0 bg-gradient-to-r from-charcoal/75 via-charcoal/40 to-charcoal/10" />
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal/50 via-transparent to-transparent" />
            </div>
          );
        })}

        {/* Copy */}
        {/* <div className="absolute inset-0">
          <div className="container-site flex h-full items-center">
            <div key={index} className="max-w-xl animate-slide-up text-cream">
              <p className="text-[10px] uppercase tracking-[0.22em] text-cream/80 sm:text-[11px]">
                {current.eyebrow}
              </p>

              <h1 className="mt-4 max-w-xl whitespace-pre-line font-display text-[38px] leading-[0.96] text-cream sm:text-6xl lg:text-[72px]">
                {current.title}
              </h1>

              <p className="mt-5 max-w-md text-sm leading-relaxed text-cream/85 sm:text-base">
                {current.text}
              </p>

              <Link
                to={current.to}
                className="btn-light group mt-8 sm:mt-10"
              >
                {current.cta}
                <ArrowRight
                  size={14}
                  aria-hidden="true"
                  className="transition-transform duration-300 ease-silk group-hover:translate-x-1"
                />
              </Link>
            </div>
          </div>
        </div> */}

        {/* Slide controls */}
        {HERO_SLIDES.length > 1 ? (
          <div className="absolute bottom-2 left-0 right-0 sm:bottom-5">
            <div className="container-site flex items-center gap-1.5 sm:gap-3">
              {HERO_SLIDES.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={`Go to slide ${i + 1}: ${slide.eyebrow}`}
                  aria-current={i === index}
                  /* The rule itself stays 2px; the button around it is 44px, so
                     the control can actually be hit with a thumb. */
                  className="group grid h-11 place-items-center px-1"
                >
                  <span
                    className={cn(
                      'block h-0.5 transition-all duration-500 ease-silk',
                      i === index
                        ? 'w-10 bg-cream sm:w-12'
                        : 'w-5 bg-cream/40 group-hover:bg-cream/70 sm:w-6'
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
