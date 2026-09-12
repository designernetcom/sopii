/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
      /*
       * SOPII brand palette — derived from the logo.
       *
       * The wordmark is two colours and only two: an oxblood #540000 that is
       * 79% of its opaque pixels, and an antique gold #C7A745 that is 12%.
       * Everything below is those two plus the warm neutrals they need to sit
       * on; nothing here is invented.
       *
       * Every value resolves through a CSS custom property declared in
       * index.css (`--c-*`, space-separated RGB channels). That indirection is
       * what makes the palette swappable: retheming the shop is editing one
       * block of `:root`, not 89 component files. The `rgb(... / <alpha-value>)`
       * form is required rather than cosmetic — it is what keeps Tailwind's
       * opacity modifiers (`bg-brand/10`, `border-charcoal/10`) working, and
       * the shop uses those in ~90 places.
       */
      brand: {
        DEFAULT: 'rgb(var(--c-brand) / <alpha-value>)',
        deep: 'rgb(var(--c-brand-deep) / <alpha-value>)',
        soft: 'rgb(var(--c-brand-soft) / <alpha-value>)',
        pale: 'rgb(var(--c-brand-pale) / <alpha-value>)',
      },
      gold: {
        DEFAULT: 'rgb(var(--c-gold) / <alpha-value>)',
        /*
         * `gold.deep` exists because `gold.DEFAULT` is decorative, not textual.
         * #C7A745 on cream is 2.29:1 — it may draw a divider or a rule, but it
         * must never carry a word. #8A6D18 is the same hue at 4.84:1, and it is
         * what the eyebrow labels are set in.
         */
        deep: 'rgb(var(--c-gold-deep) / <alpha-value>)',
        soft: 'rgb(var(--c-gold-soft) / <alpha-value>)',
        pale: 'rgb(var(--c-gold-pale) / <alpha-value>)',
      },

      /* Warm neutrals — the ground the oxblood sits on. */
      ivory: 'rgb(var(--c-ivory) / <alpha-value>)',
      cream: 'rgb(var(--c-cream) / <alpha-value>)',
      sand: 'rgb(var(--c-sand) / <alpha-value>)',
      beige: 'rgb(var(--c-beige) / <alpha-value>)',

      /*
       * Text. Warm-tinted rather than neutral grey so it belongs to the same
       * family as the oxblood; `faint` is held at 4.7:1 on cream because it
       * carries 11px captions, which is where AA is easiest to lose.
       */
      charcoal: {
        DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)',
        soft: 'rgb(var(--c-ink-soft) / <alpha-value>)',
        muted: 'rgb(var(--c-ink-muted) / <alpha-value>)',
        faint: 'rgb(var(--c-ink-faint) / <alpha-value>)',
      },

      /*
       * Status.
       *
       * These are the one part of the palette that is deliberately *not* drawn
       * from the logo: an error has to read as an error before it reads as
       * SOPII. They are tuned to the warm ground (desaturated, slightly
       * darkened) so they sit in the same room as the brand without blending
       * into it, and each clears 4.5:1 on cream, ivory and sand alike.
       *
       * `sale` is the brand oxblood on purpose. A markdown price is not an
       * error, and giving it its own red put two near-identical reds in the
       * palette — 13 degrees of hue apart — which is how a price ends up
       * looking like a validation failure. Oxblood is also simply how a
       * premium label marks a reduction.
       */
      success: {
        DEFAULT: 'rgb(var(--c-success) / <alpha-value>)',
        pale: 'rgb(var(--c-success-pale) / <alpha-value>)',
      },
      warning: {
        DEFAULT: 'rgb(var(--c-warning) / <alpha-value>)',
        pale: 'rgb(var(--c-warning-pale) / <alpha-value>)',
      },
      danger: {
        DEFAULT: 'rgb(var(--c-danger) / <alpha-value>)',
        pale: 'rgb(var(--c-danger-pale) / <alpha-value>)',
      },
      info: {
        DEFAULT: 'rgb(var(--c-info) / <alpha-value>)',
        pale: 'rgb(var(--c-info-pale) / <alpha-value>)',
      },
      sale: 'rgb(var(--c-sale) / <alpha-value>)',
      },

      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      letterSpacing: {
        widest2: '0.18em',
        widest3: '0.28em',
      },
      maxWidth: {
        site: '1440px',
      },
      aspectRatio: {
        portrait: '3 / 4',
        editorial: '4 / 5',
      },
      transitionTimingFunction: {
        silk: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(18px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        slideInLeft: {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        pop: {
          '0%': { transform: 'scale(1)' },
          '45%': { transform: 'scale(1.28)' },
          '100%': { transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease both',
        'slide-up': 'slideUp 0.6s cubic-bezier(0.22,1,0.36,1) both',
        'slide-down': 'slideDown 0.25s cubic-bezier(0.22,1,0.36,1) both',
        'slide-in-right': 'slideInRight 0.4s cubic-bezier(0.22,1,0.36,1) both',
        'slide-in-left': 'slideInLeft 0.35s cubic-bezier(0.22,1,0.36,1) both',
        'scale-in': 'scaleIn 0.25s cubic-bezier(0.22,1,0.36,1) both',
        pop: 'pop 0.35s ease',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
