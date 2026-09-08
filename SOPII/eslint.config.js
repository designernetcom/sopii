import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/*
 * SOPII's lint rules.
 * ===========================================================================
 * `npm run lint` has existed in package.json since the first commit and has
 * never worked — there was no configuration file, so ESLint exited with
 * "couldn't find an eslint.config.*" every time. Which means nothing in this
 * application has ever been linted, and §21's "remove warnings, remove unused
 * imports, remove dead code" had no instrument to measure itself against.
 *
 * The ruleset is deliberately small. A large one on a codebase that has never
 * been linted produces hundreds of findings, gets suppressed wholesale, and
 * teaches everybody to ignore the linter. These are the rules that catch real
 * defects:
 *
 *   react-hooks/rules-of-hooks       a hook in a condition is a crash
 *   react-hooks/exhaustive-deps      a missing dep is a stale closure, which is
 *                                    the single commonest React bug there is
 *   no-unused-vars                   dead code and forgotten imports, which is
 *                                    exactly what §21 asks to remove
 *   react/jsx-key                    a missing key is a silent rendering bug
 *
 * Style is not policed here at all; that is what a formatter is for.
 */

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.config.js'],
  },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      /* This project does not use PropTypes; it uses JSDoc on the components
         that need documenting. Enforcing PropTypes would be several hundred
         findings for no defect caught. */
      'react/prop-types': 'off',
      /* The automatic JSX runtime is on, so React is not in scope by name. */
      'react/react-in-jsx-scope': 'off',

      /*
       * Unused *arguments* are often meaningful — a signature kept for a
       * callback contract — so those are exempted by an underscore prefix
       * rather than reported. Unused imports and variables are not.
       */
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],

      /* Fast Refresh only works when a module exports components and nothing
         else. See the override at the bottom of this file for where that is
         deliberately not the case. */
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      /*
       * Errors, not warnings. A missing dependency is a stale value rendered to
       * a customer — a wrong price, an old stock count — and it is invisible in
       * review. This is the rule that earns the whole configuration.
       */
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  {
    /*
     * Providers, and the hooks that read them.
     *
     * `react-refresh/only-export-components` wants a module to export
     * components and nothing else, so that Vite can hot-replace it without
     * losing state. Every context in this application exports a provider
     * *and* its hook — `<CatalogProvider>` with `useCatalog`, `<AuthProvider>`
     * with `useAuth` — which is the ordinary React context pattern and the
     * reason those hooks are discoverable at all.
     *
     * Satisfying the rule would mean splitting fourteen files into
     * twenty-eight so that a development-time refresh is slightly smoother.
     * That is a bad trade, and leaving sixteen permanent warnings is a worse
     * one: warnings that are always present are warnings nobody reads, which
     * is how a real finding gets missed. So it is switched off exactly where
     * it does not apply, and stays on everywhere else.
     */
    files: ['src/context/**/*.jsx', 'src/components/SEO/SEOHead.jsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  {
    /*
     * Components that also export a small helper used by their siblings — a
     * method list, a variant map. Same argument as above, at a smaller scale.
     */
    files: [
      'src/components/auth/AuthMethodSelector.jsx',
      'src/components/auth/GoogleLoginButton.jsx',
      'src/components/auth/WhatsAppLogin.jsx',
    ],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  {
    /* Node context, not browser. */
    files: ['vite.config.js', 'tailwind.config.js', 'postcss.config.js'],
    languageOptions: { globals: globals.node },
  },
];
