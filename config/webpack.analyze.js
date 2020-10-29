/** webpack.analyze.js */
module.exports = (env) => {
  return {
    stats: {
      preset: "details",
      colors: true,
      hash: true,
      timings: true,
      assets: true,
      chunks: true,
      chunkModules: true,
      modules: true,
      children: true,
    },
    plugins: [
      new (require("webpack-bundle-analyzer").BundleAnalyzerPlugin)({
        analyzerMode: env.server ? "server" : "static",
        excludeAssets: ["node_modules", "./node_modules"],
      }),
    ],
  };
};
