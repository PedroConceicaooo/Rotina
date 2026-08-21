'use strict';

const js = require('@eslint/js');
const globals = require('globals');

const rotinaGlobals = {
  RotinaStore: 'readonly',
  RotinaNLP: 'readonly',
  RotinaNotify: 'readonly',
  RotinaApp: 'readonly'
};

module.exports = [
  js.configs.recommended,
  {
    ignores: ['testes/screenshots/**']
  },
  {
    files: ['eslint.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      ecmaVersion: 2021,
      globals: globals.node
    }
  },
  {
    // js/store.js e js/notify.js: rodam tanto na página quanto no sw.js
    files: ['js/store.js', 'js/notify.js'],
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2021,
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        ...rotinaGlobals
      }
    }
  },
  {
    // js/nlp.js e js/app.js: só rodam na página
    files: ['js/nlp.js', 'js/app.js'],
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2021,
      globals: {
        ...globals.browser,
        ...rotinaGlobals
      }
    }
  },
  {
    files: ['sw.js'],
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2021,
      globals: {
        ...globals.serviceworker,
        ...rotinaGlobals
      }
    }
  },
  {
    files: ['testes/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      ecmaVersion: 2021,
      globals: {
        ...globals.node,
        ...rotinaGlobals
      }
    }
  },
  {
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  }
];
