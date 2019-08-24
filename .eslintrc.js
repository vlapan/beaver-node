module.exports = {
    parser: 'babel-eslint',
    extends: [
        'airbnb-base',
        'plugin:flowtype/recommended',
        'plugin:css-modules/recommended',
        'prettier',
        'prettier/flowtype',
    ],
    plugins: [
        'import',
        'flowtype',
        'css-modules',
        'prettier',
    ],
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
    },
    settings: {
        'import/resolver': {
            node: {
                moduleDirectory: ['node_modules', 'src'],
            },
        },
    },
};
