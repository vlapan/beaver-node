module.exports = {
    parser: 'babel-eslint',
    extends: [
        'airbnb-base',
        "eslint:recommended",
        "plugin:node/recommended",
        'plugin:flowtype/recommended',
        'plugin:css-modules/recommended',
        // 'plugin:jsdoc/recommended',
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
        'max-len': ['error', 999, 4],
        'indent': ['error', 4],
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
    },
    settings: {
        'import/resolver': {
            node: {
                moduleDirectory: ['node_modules', 'lib', 'src'],
            },
        },
    },
};
