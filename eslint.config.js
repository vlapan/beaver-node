import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import pluginJs from '@eslint/js';
import json from '@eslint/json';
import pluginNode from 'eslint-plugin-n';
import pluginWC from 'eslint-plugin-wc';
import pluginLit from 'eslint-plugin-lit';
import pluginPromise from 'eslint-plugin-promise';
import pluginImport from 'eslint-plugin-import-x';
import pluginUnicorn from 'eslint-plugin-unicorn';
import stylistic from '@stylistic/eslint-plugin';

export default defineConfig([
    ////
    // General settings
    globalIgnores(['dist/', 'build/', 'coverage/', 'node_modules/']),
    {
        files: ['**/*.js'],
        languageOptions: {
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
    },
    {
        files: ['**/*.cjs'],
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
        files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
        plugins: { pluginJs },
        extends: [pluginJs.configs.recommended],
        rules: {
            'func-names': ['error', 'never'],
            'no-console': 'off',
            'no-continue': 'off',
            'no-underscore-dangle': 'off',
            // 'no-bitwise': [
            //     'error',
            //     {
            //         int32Hint: true,
            //         allow: ['~', '|='],
            //     },
            // ],
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

    ////
    // Stylistic
    //     {
    //         files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    //         plugins: { stylistic },
    //         extends: [stylistic.configs.all],
    //         rules: {
    //             '@stylistic/indent': [
    //                 'error',
    //                 4,
    //                 {
    //                     SwitchCase: 1,
    //                 },
    //             ],
    //             '@stylistic/semi': [
    //                 2,
    //                 'always',
    //                 {
    //                     omitLastInOneLineBlock: true,
    //                 },
    //             ],
    //             '@stylistic/quote-props': ['error', 'as-needed'],
    //             '@stylistic/padded-blocks': ['error', 'never'],
    //             '@stylistic/quotes': ['error', 'single'],
    //             '@stylistic/comma-dangle': ['error', 'always-multiline'],
    //             '@stylistic/max-len': ['error', 999, 4],
    //             '@stylistic/wrap-regex': 'off',
    //             '@stylistic/space-before-function-paren': [
    //                 'error',
    //                 {
    //                     anonymous: 'always',
    //                     named: 'never',
    //                     asyncArrow: 'always',
    //                 },
    //             ],
    //             '@stylistic/multiline-ternary': ['error', 'never'],
    //             '@stylistic/multiline-comment-style': ['error', 'separate-lines'],
    //             '@stylistic/spaced-comment': [
    //                 'error',
    //                 'always',
    //                 {
    //                     exceptions: ['-', '=', '+', '/'],
    //                 },
    //             ],
    //             '@stylistic/dot-location': ['error', 'property'],
    //             '@stylistic/no-extra-parens': 'off',
    //             '@stylistic/newline-per-chained-call': 'off',
    //
    //             // Replaces function-paren-newline, function-call-argument-newline,
    //             // array-bracket-newline, array-element-newline, and object-curly-spacing
    //             '@stylistic/list-style': 'error',
    //             '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
    //         },
    //     },
    ////

    ////
    // NodeJS settings
    {
        files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
        ignores: ['lib/https/views/*.js', 'lib/https/public/js/*.mjs'],
        plugins: { pluginNode },
        extends: [pluginNode.configs['flat/recommended-module']],
        rules: {
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
        files: ['lib/https/views/*.js', 'lib/https/public/js/*.mjs'],
        plugins: { pluginWC },
        extends: [pluginWC.configs['flat/recommended']],
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
        files: ['lib/https/views/*.js', 'lib/https/public/js/*.mjs'],
        plugins: { pluginLit },
        extends: [pluginLit.configs['flat/recommended']],
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
    {
        files: ['**/*.json'],
        ignores: ['package-lock.json'],
        language: 'json/json',
        plugins: { json },
        extends: ['json/recommended'],
    },
    ////

    ////
    // Promise
    {
        files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
        plugins: { pluginPromise },
        extends: [pluginPromise.configs['flat/recommended']],
    },
    ////

    ////
    // Unicorn
    // {
    //     files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    //     plugins: { unicorn: pluginUnicorn },
    //     extends: [pluginUnicorn.configs['recommended']],
    //     rules: {
    //         'unicorn/prevent-abbreviations': 'off',
    //         'unicorn/template-indent': [
    //             'error',
    //             {
    //                 indent: 4,
    //             },
    //         ],
    //         'unicorn/filename-case': [
    //             'error',
    //             {
    //                 cases: {
    //                     kebabCase: true,
    //                     pascalCase: true,
    //                 },
    //             },
    //         ],
    //         // 'unicorn/catch-error-name': [
    //         //     'error',
    //         //     {
    //         //         name: 'e',
    //         //     },
    //         // ],
    //         'unicorn/prefer-string-replace-all': 'off', // replaceAll isn't faster, at least on Safari
    //         'unicorn/prefer-module': 'off',
    //     },
    // },
    ////

    ////
    // Import plugins
    //     {
    //         files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    //         plugins: { import: pluginImport },
    //         extends: [pluginImport.configs['flat/recommended']],
    //         rules: {
    //             // analysis/correctness
    //             // 'import-x/no-unresolved': 'error',
    //             'import-x/named': 'error',
    //             'import-x/namespace': 'error',
    //             'import-x/default': 'error',
    //             'import-x/export': 'error',
    //
    //             // red flags (thus, warnings)
    //             // 'import-x/no-named-as-default': 'warn',
    //             'import-x/no-named-as-default-member': 'off',
    //             'import-x/no-duplicates': 'warn',
    //
    //             // other
    //             'import-x/order': 'error',
    //             'import-x/group-exports': 'error',
    //             'import-x/exports-last': 'error',
    //         },
    //         settings: {
    //             'import-x/resolver': {
    //                 node: {
    //                     moduleDirectory: ['node_modules', 'lib', 'src'],
    //                 },
    //             },
    //         },
    //     },
    ////
]);
