module.exports = {
    presets: [
        [
            '@babel/preset-env',
            {
                targets: {
                    node: 'current',
                },
            },
        ],
        '@babel/preset-stage-2',
        '@babel/preset-flow',
    ],
    ignore: ['node_modules', 'build'],
    plugins: ['transform-decorators-legacy', 'syntax-async-functions', 'transform-regenerator'],
    sourceMaps: true,
    retainLines: true,
    comments: false,
};
