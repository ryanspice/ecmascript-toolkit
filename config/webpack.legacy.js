/**
 * webpack.legacy.js
 * merges into webpack.config.babel.js, webpack-polyfill-injector and additional parameters for legacy builds
 */
module.exports = function (env) {
  const entry = {};
  entry[`${env.output.library}`] = [
    `webpack-polyfill-injector?${JSON.stringify({
      modules: "./src/index.js",
    })}!`,
  ];
  return {
    entry: entry,
    output: {
      library: `${env.output.library}`,
      chunkFilename: env.chunkFilename,
      filename: env.filename,
    },
    plugins: [
      new (require("webpack-polyfill-injector"))({
        minify: env.production,
        singleFile: true,
        filename: env.polyfill,
        polyfills: require("./polyfills.js"),
      }),
    ],
  };
};
