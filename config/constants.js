const path = require("path");
const { merge } = require("webpack-merge");
const _package_ = require(path.resolve(__dirname, "../package.json"));
const _config_ = {
  legacy: false,
  webpackbar: false,
};
const _settings_ = {
  webpackbar: false,
};
const _mode_ = "development";
const _browserslist_ = _config_.legacy
  ? "last 5 years, cover 96% in CA, not ie<=10"
  : "supports es6-module";
const _default_environment_ = {
  NODE_ENV: "development",
  production: "true",
};
const _mode_is_production_ = (function () {
  return _mode_ === "PRODUCTION";
})();
const _mode_is_analyze_ = (function () {
  return _mode_ === "ANALYZE";
})();
const _build_is_server_ = (function () {
  return process.env.WEBPACK_DEV_SERVER;
})();
const _build_to_minify_ = (function () {
  return true;
})();
const _build_to_analyze_ = (function () {
  return false;
})();
const _default_colour_ = "#1F787F";
const constants = (env) => {
  if (env === undefined) {
    env = {
      development: true,
      production: false,
      legacy: false,
      static: false,
      server: false,
      analyze: false,
    };
  }
  env.tests = {
    js: /\.(mjs|js)?$/,
  };
  env.babel = require(path.resolve(__dirname, "./babel.config.js"))(env);
  env.extension = env.legacy ? "js" : "mjs";
  env.maps = "inline-source-map";
  const _output_name_ =
    process.env.npm_package_short_name ||
    process.env.npm_package_name.replace(" ", "").toLowerCase();
  const _output_path_ = "../dist";
  const _output_filename_ = !env.legacy ? "[name]." + env.extension : "[name]." + env.extension;
  const _output_filename_prod_ = !env.legacy
    ? "[name].[contenthash]." + env.extension
    : "[name].[contenthash]." + env.extension;
  const _chunk_filename_ = !env.legacy ? "[name]." + env.extension : "[name]." + env.extension;
  const _chunk_filenameProd_ = !env.legacy
    ? "[name].[contenthash]." + env.extension
    : "[name].[contenthash]." + env.extension;
  env.entry = {};
  env.entry[_output_name_] = ["./src/index.js", "./src/index.scss"];
  const _self_ = {};
  _self_[_output_name_] = _output_name_;
  env.externals = [_self_];
  //env.externals.push(_self_);
  env.container = env.legacy ? "index.htm" : "index.html";
  env.filename = env.production ? _output_filename_prod_ : _output_filename_;
  env.chunkFilename =
    env.chunkFilename || (env.production ? _chunk_filenameProd_ : _chunk_filename_);
  env.polyfill = env.production ? "polyfill.[contenthash].js" : "polyfill.js";
  env.output = {
    filename: env.filename,
    library: _output_name_,
    //libraryTarget: "umd",
    umdNamedDefine: true,
    chunkFilename: env.chunkFilename,
    //chunkLoading: env.legacy ? "jsonp" : "import-scripts",
    scriptType: env.legacy ? "text/javascript" : "module",
    path: !env.server ? path.resolve(__dirname, _output_path_) : path.resolve("./dist"),
    publicPath: "../",
    globalObject: "window",
  };
  return env;
};
module.exports = {
  _package_,
  _build_is_server_,
  _build_to_minify_,
  _build_to_analyze_,
  _default_colour_,
  _default_environment_,
  _mode_,
  _browserslist_,
  _mode_is_analyze_,
  _mode_is_production_,
  _config_,
  _settings_,
  path,
  merge,
  constants,
};
