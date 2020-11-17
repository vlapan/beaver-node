module.exports = {
    extends: [
        'airbnb-base',
        "eslint:recommended",
        "plugin:node/recommended",
        'plugin:css-modules/recommended',
        // 'plugin:security/recommended',
        'prettier',
        'prettier/flowtype',
    ],
    plugins: [
        'import',
        'flowtype',
        'css-modules',
        'prettier',
    ],
    parserOptions: {
        "ecmaVersion": 2020
    },
    rules: {
        'semi': [2, "always", { "omitLastInOneLineBlock": true }],
        'max-len': ['error', 999, 4],
        "indent": ["error", 4], // ["error", 4, { "SwitchCase": 1 }],
        'func-names': ['error', 'never'],
        'no-console': 'off',
        'no-continue': 'off',
        'no-underscore-dangle': 'off',
        'no-bitwise': ['error', {
            'int32Hint': true,
            'allow': ['~'],
        }],
        'no-restricted-syntax': 'off',
        'no-plusplus': 'off',
        'no-await-in-loop': 'off',
    },
    settings: {
        'import/resolver': {
            node: {
                moduleDirectory: ['node_modules', 'lib', 'src'],
            },
        },
    },
};
