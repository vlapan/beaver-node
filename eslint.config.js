const globals = require('globals');
const pluginJs = require('@eslint/js');
const pluginNode = require('eslint-plugin-n');
const pluginWC = require('eslint-plugin-wc');
const pluginLit = require('eslint-plugin-lit');
const pluginJSON = require('eslint-plugin-json');
const pluginPromise = require('eslint-plugin-promise');
const pluginImport = require('eslint-plugin-import');
const pluginUnicorn = require('eslint-plugin-unicorn');
const stylisticJs = require('@stylistic/eslint-plugin-js');

module.exports = [
    ////
    // General settings
    {
        ignores: ['build/*', '!build/index.js'],
    },
    {
        files: ['**/*.js', '**/*.cjs'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
            },
        },
    },
    {
        files: ['**/*.mjs'],
        languageOptions: {
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
    },
    {
        ...pluginJs.configs.recommended,
        rules: {
            ...pluginJs.configs.recommended.rules,
            'func-names': ['error', 'never'],
            'no-console': 'off',
            'no-continue': 'off',
            'no-underscore-dangle': 'off',
            'no-bitwise': [
                'error',
                {
                    int32Hint: true,
                    allow: ['~'],
                },
            ],
            'no-restricted-syntax': 'off',
            'no-plusplus': 'off',
            'no-await-in-loop': 'off',
            'no-empty': [
                'error',
                {
                    allowEmptyCatch: true,
                },
            ],
        },
    },
    {
        ...stylisticJs.configs['all-flat'],
        plugins: {
            '@stylistic/js': stylisticJs,
        },
        rules: {
            ...stylisticJs.configs['all-flat'].rules,
            '@stylistic/js/indent': [
                'error',
                4,
                {
                    SwitchCase: 1,
                },
            ],
            '@stylistic/js/semi': [
                2,
                'always',
                {
                    omitLastInOneLineBlock: true,
                },
            ],
            '@stylistic/js/quote-props': ['error', 'as-needed'],
            '@stylistic/js/padded-blocks': ['error', 'never'],
            '@stylistic/js/quotes': ['error', 'single'],
            '@stylistic/js/comma-dangle': ['error', 'always-multiline'],
            '@stylistic/js/max-len': ['error', 999, 4],
            '@stylistic/js/space-before-function-paren': [
                'error',
                {
                    anonymous: 'always',
                    named: 'never',
                    asyncArrow: 'always',
                },
            ],
            '@stylistic/js/function-paren-newline': ['error', 'consistent'],
            '@stylistic/js/multiline-ternary': ['error', 'never'],
            '@stylistic/js/function-call-argument-newline': ['error', 'consistent'],
            '@stylistic/js/array-bracket-newline': [
                'error',
                'consistent',
            ],
            '@stylistic/js/array-element-newline': [
                'error',
                {
                    consistent: true,
                    multiline: false,
                },
            ],
            '@stylistic/js/multiline-comment-style': ['error', 'separate-lines'],
            '@stylistic/js/spaced-comment': [
                'error',
                'always',
                {
                    exceptions: ['-', '=', '+', '/'],
                },
            ],
            '@stylistic/js/dot-location': ['error', 'property'],
            '@stylistic/js/object-curly-spacing': ['error', 'always'],
            '@stylistic/js/no-extra-parens': 'off',
            '@stylistic/js/newline-per-chained-call': 'off',
        },
    },
    ////

    ////
    // NodeJS settings
    {
        ...pluginNode.configs['flat/recommended-script'],
        ignores: ['**/*.mjs', 'lib/https/views/*.js', 'lib/https/public/js/*.mjs'],
        rules: {
            ...pluginNode.configs['flat/recommended-script'].rules,
            'n/no-missing-import': [
                'error',
                {
                    allowModules: ['lit-html'],
                },
            ],
            'n/no-unsupported-features/es-syntax': [
                'error',
                {
                    ignores: ['modules', 'dynamicImport'],
                },
            ],
        },
    },
    ////

    ////
    // Web settings
    {
        ...pluginWC.configs['flat/recommended'],
        files: ['lib/https/views/*.js', 'lib/https/public/js/*.mjs'],
        languageOptions: {
            sourceType: 'module',
            globals: {
                ...globals.browser,
                yaumnrc: 'readonly',
                explainer: 'readonly',
                ace: 'readonly',
            },
        },
        settings: {
            wc: {
                elementBaseClasses: ['LitElement'], // Recognize `LitElement` as a Custom Element base class
            },
        },
    },
    {
        ...pluginLit.configs['flat/recommended'],
        files: ['lib/https/views/*.js', 'lib/https/public/js/*.mjs'],
        languageOptions: {
            sourceType: 'module',
            globals: {
                ...globals.browser,
                yaumnrc: 'readonly',
                explainer: 'readonly',
                ace: 'readonly',
            },
        },
    },
    ////

    ////
    // JSON
    pluginJSON.configs.recommended,
    ////

    ////
    // Promise
    pluginPromise.configs['flat/recommended'],
    ////

    ////
    // Unicorn
    {
        ...pluginUnicorn.configs['flat/recommended'],
        rules: {
            ...pluginUnicorn.configs['flat/recommended'].rules,
            'unicorn/prevent-abbreviations': 'off',
            'unicorn/template-indent': [
                'error',
                {
                    indent: 4,
                },
            ],
            'unicorn/filename-case': [
                'error',
                {
                    cases: {
                        kebabCase: true,
                        pascalCase: true,
                    },
                },
            ],
            'unicorn/catch-error-name': [
                'error',
                {
                    name: 'e',
                },
            ],
            'unicorn/prefer-string-replace-all': 'off', // replaceAll isn't faster, at least on Safari
            'unicorn/prefer-module': 'off',
        },
    },
    ////

    ////
    // Import plugins
    {
        plugins: {
            import: pluginImport,
        },
        rules: {
            // analysis/correctness
            // 'import/no-unresolved': 'error',
            'import/named': 'error',
            'import/namespace': 'error',
            'import/default': 'error',
            'import/export': 'error',

            // red flags (thus, warnings)
            // 'import/no-named-as-default': 'warn',
            // 'import/no-named-as-default-member': 'warn',
            'import/no-duplicates': 'warn',

            // other
            'import/order': 'error',
            'import/group-exports': 'error',
            'import/exports-last': 'error',
        },
        settings: {
            'import/resolver': {
                node: {
                    moduleDirectory: ['node_modules', 'lib', 'src'],
                },
            },
        },
    },
    ////
];
