/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /* SOPII brand palette — plum, rose, and gold */
        ivory: '#F9F5F2',
        cream: '#FFFDFB',
        sand: '#F4EAE3',
        beige: '#E9D8BF',
        /*
       * `clay` is unchanged — it is the brand colour, and it is what icons,
       * borders and anything at body size still use.
       *
       * `clay.deep` exists for *small* text only. At 10-11px, #A76D5E on cream
       * measures 4.15:1, just under the 4.5:1 WCAG AA needs, and the eyebrow
       * labels are set at exactly that size. #9F6657 is the same hue and
       * saturation three points darker: 4.59:1, and indistinguishable from the
       * original beside it.
       */
      clay: {
        DEFAULT: '#A76D5E',
        deep: '#9F6657',
      },
        plum: {
          DEFAULT: '#7D2B69',
          deep: '#4D123F',
          soft: '#A6508A',
          pale: '#F3E3F0',
        },
        charcoal: {
          DEFAULT: '#2D1F2B',
          soft: '#4F3C48',
          muted: '#6B5868',
          /*
         * Darkened from #93818A to clear WCAG AA.
         *
         * This tint carries a lot of 11px text — captions, the footer legal
         * row, "(24 reviews)" — and at that size #93818A measured 3.60:1 on
         * cream, well under the 4.5:1 minimum. #816E78 is the same hue and
         * saturation, ~7% darker in lightness, and measures 4.67:1. It is a
         * functional grey rather than one of the brand hues (plum, clay,
         * gold), all of which are untouched.
         */
        faint: '#816E78',
        },
        gold: {
          DEFAULT: '#C9A867',
          soft: '#DABF8C',
          pale: '#F3E7C9',
        },
        sale: '#9A3D72',
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
