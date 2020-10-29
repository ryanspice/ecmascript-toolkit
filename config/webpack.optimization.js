module.exports = (env) => {
  return {
    performance: {
      hints: env.production ? false : "warning",
      maxEntrypointSize: !env.production ? (env.legacy ? 8560000 : 1060000) : 500000,
      maxAssetSize: !env.production ? (env.legacy ? 8500000 : 1000000) : 400000,
    },
    optimization: {
      minimize: env.production,
      minimizer: [
        new (require("terser-webpack-plugin"))({
          terserOptions: {
            ecma: env.legacy ? undefined : 2020,
            mangle: env.production,
            module: env.production && !env.legacy,
            toplevel: env.production,
            nameCache: null,
            ie8: false,
            keep_classnames: env.production,
            keep_fnames: env.production,
            safari10: false,
            output: {
              comments: env.production,
            },
          },
          extractComments: env.production,
        }),
        "...",
        new (require("css-minimizer-webpack-plugin"))({
          sourceMap: true,
        }),
      ],
      splitChunks: {
        chunks: "all",
        automaticNameDelimiter: "~",
        cacheGroups: {
          styles: {
            name: "styles",
            test: /\.css$/,
            chunks: "all",
            enforce: true,
          },
        },
      },
      runtimeChunk: {
        name: (entrypoint) => `${entrypoint.name}.entry`,
      },
      chunkIds: "deterministic",
      moduleIds: "deterministic",
      usedExports: true,
      concatenateModules: true,
    },
    plugins: [
      new (require("babel-minify-webpack-plugin"))(
        env.production
          ? {
              booleans: true,
              builtIns: true,
              consecutiveAdds: true,
              deadcode: true,
              evaluate: false,
              flipComparisons: true,
              guards: true,
              infinity: true,
              memberExpressions: true,
              mergeVars: true,
              numericLiterals: true,
              propertyLiterals: true,
              regexpConstructors: true,
              replace: true,
              simplify: true,
              simplifyComparisons: true,
              typeConstructors: true,
              removeConsole: false,
              removeDebugger: false,
              removeUndefined: true,
              undefinedToVoid: true,
              mangle: true,
              keepFnName: true,
            }
          : {},
      ),
    ],
  };
};
