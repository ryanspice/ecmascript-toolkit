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

const isHashed = true;

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
  if (!env) {
    env = {};
  }
  //console.log(env);
  // verify
  env.development = env.hasOwnProperty("development") ? env.development === "true" : true;
  env.production = env.hasOwnProperty("production") ? env.production === "true" : false;
  env.legacy = env.hasOwnProperty("legacy") ? env.legacy === "true" : false;
  env.static = env.hasOwnProperty("static") ? env.static === "true" : false;
  env.server = env.hasOwnProperty("server") ? env.server === "true" : false;
  env.analyze = env.hasOwnProperty("analyze") ? env.analyze === "true" : false;
  env.configs = {
    //name: process.env.npm_package_name,
    //short_name: process.env.npm_package_short_name,
    //babel: require(path.resolve(__dirname, "./babel.config.js"))(env),
  };
  env.output = {
    // library:
    //   env.configs.short_name ||
    //   env.configs.name.replace(" ", "").toLowerCase()
  };
  env.tests = {
    js: /\.(mjs|js)?$/,
  };
  env.babel = require(path.resolve(__dirname, "./babel.config.js"))(env);

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
