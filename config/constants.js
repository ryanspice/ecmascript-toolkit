const path = require("path");
const {merge} = require("webpack-merge");

const _package_ = require(path.resolve(__dirname, "../package.json"));

const _config_ = {
  legacy: false,
  webpackbar: false
};

const _settings_ = {
  webpackbar: false
};

const _mode_ = "development";

const isHashed = true;

const _browserslist_ = _config_.legacy
  ? "last 5 years, cover 96% in CA, not ie<=10"
  : "supports es6-module";

const _default_postcss_ = {
  plugins: {
    //"postcss-normalize": {},
    "postcss-preset-env": {
      browsers: _config_.legacy ? "last 1 year, cover 92% in CA, not ie<=10" : "supports es6-module"
    },
    autoprefixer: {}
  }
};

const _default_environment_ = {
  NODE_ENV: "development",
  production: "true"
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

const _babel_ = require(path.resolve("./config/babel.config.js"))({
  _mode_is_legacy_: _config_.legacy
});

const _default_colour_ = "#1F787F";

module.exports = {
  _package_,

  _babel_,
  _build_is_server_,
  _build_to_minify_,
  _build_to_analyze_,
  _default_postcss_,
  _default_colour_,
  _default_environment_,
  _mode_,
  _browserslist_,
  _mode_is_analyze_,
  _mode_is_production_,

  _config_,
  _settings_,

  path,
  merge
};
