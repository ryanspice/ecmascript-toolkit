/**
 * server.config.js
 * all devServer options
 */
module.exports = function (env) {
  return {
    devServer: {
      port: !env.legacy ? process.env.port + 1 || 8081 : process.env.port || 8080,
      proxy: require("./proxy.config"),
      historyApiFallback: true,
      contentBase: "./dist",
      //"contentBase": false,
      //"hot": true,
      inline: true,
      //compress: env.production,
      stats: {
        assets: true,
        children: false,
        chunks: true,
        hash: true,
        modules: true,
        publicPath: false,
        timings: true,
        version: false,
        warnings: true,
      },
      watchOptions: {
        ignored: ["node_modules", "dist", "config"],
      },
    },
  };
};
