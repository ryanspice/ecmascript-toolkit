/** babel.config.js */
const {resolve} = require("path");
module.exports = (env) => {
  return {
    loader:resolve("./node_modules/babel-loader?cacheDirectory") ,
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
              browsers: env.browsers,
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
