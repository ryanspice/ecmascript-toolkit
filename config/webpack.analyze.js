const {_build_is_server_} = require("./constants");

const analyzer = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;

/**
 * webpack.analyze.js
 */
module.exports = (e) => {
  return {
    plugins: [
      new analyzer({
        analyzerMode: _build_is_server_ ? "server" : "static",
        excludeAssets: ["node_modules", "./node_modules"]
      })
    ]
  };
};
