const { _package_ } = require("./constants");
/**
 * webpack.legacy.js
 * merges into webpack.config.babel.js, webpack-polyfill-injector and additional paramaters for legacy builds
 */
module.exports = function (env) {
  const name = _package_.short_name;
  const entry = {};
  entry[`${name}`] = `webpack-polyfill-injector?${JSON.stringify({
    modules: "./src",
  })}!`;
  return {
    entry: entry,
    output: {
      library: `${name}`,
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
