/** webpack.prod.js */
module.exports = function (env) {
  return {
    mode: "production",
    devtool: "source-map",
    stats: {
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
      //new webpack.NamedModulesPlugin(),
      //new webpack.optimize.DedupePlugin(),
      //new webpack.optimize.OccurrenceOrderPlugin(),
      new (require("webpack").optimize.ModuleConcatenationPlugin)(),
      //new webpack.optimize.OccurrenceOrderPlugin(true)
    ],
  };
};
