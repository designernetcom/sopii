/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /*
         * SOPII admin palette — the same logo as the storefront.
         *
         * The wordmark is an oxblood #540000 and an antique gold #C7A745. The
         * ramp below is built around the oxblood: it lands exactly on the logo
         * colour at `brand-700`, so a primary button (`bg-brand-600`) hovering
         * to `brand-700` settles on the mark itself.
         *
         * Values resolve through the CSS custom properties in index.css, which
         * is what makes the scheme swappable from one block rather than from
         * the ~450 call sites that name a brand shade. The
         * `rgb(... / <alpha-value>)` form keeps the opacity modifiers the admin
         * leans on (`bg-brand-500/10`, `ring-brand-600/20`) working.
         */
        brand: {
          50: 'rgb(var(--c-brand-50) / <alpha-value>)',
          100: 'rgb(var(--c-brand-100) / <alpha-value>)',
          200: 'rgb(var(--c-brand-200) / <alpha-value>)',
          300: 'rgb(var(--c-brand-300) / <alpha-value>)',
          /* Dark mode's body text tone. Tuned up from the ramp's natural step
             to clear 4.5:1 on `ink-900`, which is where `text-brand-400`
             actually lands in 33 places. */
          400: 'rgb(var(--c-brand-400) / <alpha-value>)',
          500: 'rgb(var(--c-brand-500) / <alpha-value>)',
          600: 'rgb(var(--c-brand-600) / <alpha-value>)',
          700: 'rgb(var(--c-brand-700) / <alpha-value>)',
          800: 'rgb(var(--c-brand-800) / <alpha-value>)',
          900: 'rgb(var(--c-brand-900) / <alpha-value>)',
          950: 'rgb(var(--c-brand-950) / <alpha-value>)',
        },
        /*
         * Neutrals, warmed.
         *
         * These were a cold blue-grey chosen for the old violet brand, and
         * beside oxblood they read as a second, competing hue. Each step keeps
         * its original *relative luminance* to four decimal places — the hue
         * moved, the lightness did not — so every contrast pair the admin
         * already relied on is unchanged and only the temperature differs.
         */
        ink: {
          50: 'rgb(var(--c-ink-50) / <alpha-value>)',
          100: 'rgb(var(--c-ink-100) / <alpha-value>)',
          200: 'rgb(var(--c-ink-200) / <alpha-value>)',
          300: 'rgb(var(--c-ink-300) / <alpha-value>)',
          400: 'rgb(var(--c-ink-400) / <alpha-value>)',
          500: 'rgb(var(--c-ink-500) / <alpha-value>)',
          600: 'rgb(var(--c-ink-600) / <alpha-value>)',
          700: 'rgb(var(--c-ink-700) / <alpha-value>)',
          800: 'rgb(var(--c-ink-800) / <alpha-value>)',
          900: 'rgb(var(--c-ink-900) / <alpha-value>)',
          950: 'rgb(var(--c-ink-950) / <alpha-value>)',
        },
        /* The logo's gold. Decorative in the admin — rules and the odd accent —
           and never a text colour on white, where it is 2.3:1. */
        gold: {
          DEFAULT: 'rgb(var(--c-gold) / <alpha-value>)',
          deep: 'rgb(var(--c-gold-deep) / <alpha-value>)',
          soft: 'rgb(var(--c-gold-soft) / <alpha-value>)',
          pale: 'rgb(var(--c-gold-pale) / <alpha-value>)',
        },
        /*
         * Semantic status aliases.
         *
         * The admin distinguishes seven order states at a glance, which needs
         * seven hues — that categorical set (amber/sky/violet/indigo/emerald/
         * rose) is doing real work and is left alone. What it lacked was a name
         * for the four that mean something: these alias the same families so
         * new code can say `text-danger` instead of picking a ramp, and so the
         * four meanings can be retuned without hunting for them.
         */
        success: 'rgb(var(--c-success) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        info: 'rgb(var(--c-info) / <alpha-value>)',
      },

      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06)',
        pop: '0 8px 24px -4px rgb(16 24 40 / 0.12), 0 4px 8px -4px rgb(16 24 40 / 0.06)',
        modal: '0 24px 48px -12px rgb(16 24 40 / 0.25)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.18s ease-out',
        'fade-in-up': 'fade-in-up 0.22s ease-out',
        'scale-in': 'scale-in 0.16s ease-out',
        'slide-in-right': 'slide-in-right 0.24s ease-out',
      },
    },
  },
  plugins: [],
};
