/**
 * bable.config.js
 * merges into webpack.config.babel.js, is babel config
 */
module.exports = (env) => {
  return {
    loader: "babel-loader?cacheDirectory",
    options: {
      sourceType: "unambiguous",
      presets: [
        [
          "@babel/preset-env",
          {
            modules: env.legacy ? "umd" : "auto",
            useBuiltIns: false,
            shippedProposals: true, // not sure about this one
            targets: {
              browsers: env.legacy
                ? "last 5 years, cover 96% in CA, not ie<=10"
                : "supports es6-module",
              esmodules: !env.legacy,
            },
            //"loose": true
          },
        ],
        "@babel/flow",
        [
          "minify",
          {
            builtIns: false,
            evaluate: false,
            mangle: false,
          },
        ],
      ],
      plugins: [
        [
          "@babel/plugin-transform-runtime",
          {
            absoluteRuntime: true,
            corejs: false,
            helpers: true,
            regenerator: true,
            useESModules: !env.legacy,
          },
        ],
        "@babel/plugin-proposal-optional-chaining",
        [
          "@babel/plugin-proposal-decorators",
          {
            legacy: true,
          },
        ],
        "@babel/plugin-proposal-function-sent",
        "@babel/plugin-proposal-export-namespace-from",
        ["@babel/plugin-proposal-object-rest-spread", { useBuiltIns: true }],
        "@babel/plugin-proposal-export-default-from",
        "@babel/plugin-proposal-numeric-separator",
        "@babel/plugin-proposal-throw-expressions",
        "@babel/plugin-syntax-dynamic-import",
        "@babel/plugin-syntax-import-meta",
        "@babel/plugin-syntax-flow",
        [
          "@babel/plugin-proposal-class-properties",
          {
            loose: false,
            ignoreUninitialized: true,
          },
        ],
        [
          "@babel/plugin-proposal-private-methods",
          {
            loose: false,
          },
        ],
        "@babel/plugin-proposal-json-strings",
      ],
    },
  };
};
