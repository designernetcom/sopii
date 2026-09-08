/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f4ff',
          100: '#ecebfe',
          200: '#dbd9fe',
          300: '#c0bcfc',
          400: '#a094f8',
          500: '#8168f1',
          600: '#6d4ae4',
          700: '#5c39c9',
          800: '#4d31a4',
          900: '#412c83',
          950: '#271a51',
        },
        ink: {
          50: '#f7f8f9',
          100: '#eef0f2',
          200: '#dfe3e8',
          300: '#c5ccd4',
          400: '#95a0ae',
          500: '#6b7787',
          600: '#525c6b',
          700: '#3f4854',
          800: '#2b323b',
          900: '#1c2129',
          950: '#12161c',
        },
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
