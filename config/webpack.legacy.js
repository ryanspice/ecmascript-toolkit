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
  env.filename = env.filename || (env.production ? _output_filename_prod_ : _output_filename_);
  env.chunkFilename =
    env.chunkFilename || (env.production ? _chunk_filenameProd_ : _chunk_filename_);
  env.extension = env.legacy ? "js" : "mjs";
  return {
    entry: entry,
    output: {
      library: `${env.output.library}_legacy`,
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
