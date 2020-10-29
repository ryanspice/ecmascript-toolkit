module.exports = (env) => {
  const production = env.production === true;
  const legacy = env.legacy === true;
  return {
    performance: {
      hints: production ? false : "warning",
      maxEntrypointSize: !production ? (legacy ? 8560000 : 1060000) : 500000,
      maxAssetSize: !production ? (legacy ? 8500000 : 1000000) : 400000,
    },
    optimization: {
      minimize: production,
      minimizer: [
        new (require("terser-webpack-plugin"))({
          terserOptions: {
            ecma: legacy ? undefined : 2020,
            mangle: production,
            module: production && !legacy,
            //toplevel: production,
            nameCache: null,
            ie8: false,
            keep_classnames: production,
            keep_fnames: production,
            safari10: production && legacy,
            output: {
              comments: production,
            },
          },
          extractComments: production,
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
  };
};
