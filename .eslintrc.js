module.exports = {
    extends: [
        'eslint:recommended',
        'plugin:node/recommended',
        'plugin:promise/recommended',
        'plugin:import/errors',
        'plugin:import/warnings',
        'plugin:json/recommended',
        'plugin:wc/recommended',
        'plugin:lit/recommended',
    ],
    plugins: [
        'node',
        'promise',
        'import',
        'json',
    ],
    env: {
        node: true,
        browser: true,
    },
    parserOptions: {
        ecmaVersion: 2022,
    },
    overrides: [{
        files: ['**/*.json'],
    }],
    rules: {
        indent: ['error', 4, {
            SwitchCase: 1,
        }],
        semi: [2, 'always', {
            omitLastInOneLineBlock: true,
        }],
        'comma-dangle': ['error', 'always-multiline'],
        'max-len': ['error', 999, 4],
        'space-before-function-paren': ['error', {
            anonymous: 'always',
            named: 'never',
            asyncArrow: 'always',
        }],
        'func-names': ['error', 'never'],
        'no-console': 'off',
        'no-continue': 'off',
        'no-underscore-dangle': 'off',
        'no-bitwise': ['error', {
            int32Hint: true,
            allow: ['~'],
        }],
        'no-restricted-syntax': 'off',
        'no-plusplus': 'off',
        'no-await-in-loop': 'off',
        'multiline-ternary': ['error', 'never'],
        'node/no-missing-import': ['error', {
            allowModules: ['lit-html'],
        }],
        "node/no-unsupported-features/es-syntax": ["error", {
            ignores: ["dynamicImport"],
        }],
    },
    settings: {
        'import/resolver': {
            node: {
                moduleDirectory: ['node_modules', 'lib', 'src'],
            },
        },
    },
    globals: {
        yaumnrc: 'readonly',
        explainer: 'readonly',
        ace: 'readonly',
    },
};
