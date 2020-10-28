const { _package_ } = require("./constants");
/**
 * webpack.legacy.js
 * merges into webpack.config.babel.js, webpack-polyfill-injector and additional paramaters for legacy builds
 */
module.exports = function (env) {
  const name = _package_.short_name;
  const entry = {};
  entry[`${env.output.library}_legacy`] = [
    `webpack-polyfill-injector?${JSON.stringify({
      modules: "./src/index.js",
    })}!`,
    "./src/index.scss",
  ];

  env.filename = env.filename || (env.production ? _output_filename_prod_ : _output_filename_);

  env.chunkFilename =
    env.chunkFilename || (env.production ? _chunk_filenameProd_ : _chunk_filename_);

  env.extension = env.legacy ? "js" : "mjs";

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
