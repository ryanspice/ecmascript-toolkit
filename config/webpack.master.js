const { constants } = require("./constants");
const { resolve } = require("path");
const { merge } = require("webpack-merge");
/** webpack.master.js */
const build = (env) => {
  const common = merge(
    require(resolve(__dirname, "./webpack.common.js"))(env),
    require(resolve(__dirname, "./webpack.console.js"))(env),
    require(resolve(__dirname, "./webpack.optimization.js"))(env),
    require(resolve(__dirname, "./webpack.rules.js"))(env),
    require(resolve(__dirname, "./webpack.css.js"))(env),
    require(resolve(__dirname, "./webpack.html.js"))(env),
    require(resolve(__dirname, "./webpack.plugins.js"))(env),
    env.analyze ? require(resolve(__dirname, "./webpack.analyze.js"))(env) : {},
    env.server ? require(resolve(__dirname, "./server.config.js"))(env) : {},
    env.production ? require(resolve(__dirname, "./webpack.prod.js"))(env) : {},
  );
  env.legacy = true;
  const legacy = merge(
    require(resolve(__dirname, "./webpack.common.js"))(env),
    require(resolve(__dirname, "./webpack.console.js"))(env),
    require(resolve(__dirname, "./webpack.optimization.js"))(env),
    require(resolve(__dirname, "./webpack.rules.js"))(env),
    require(resolve(__dirname, "./webpack.css.js"))(env),
    require(resolve(__dirname, "./webpack.html.js"))(env),
    require(resolve(__dirname, "./webpack.plugins.js"))(env),
    require(resolve(__dirname, "./webpack.legacy.js"))(env),
    env.analyze ? require(resolve(__dirname, "./webpack.analyze.js"))(env) : {},
    env.server ? require(resolve(__dirname, "./server.config.js"))(env) : {},
    env.production ? require(resolve(__dirname, "./webpack.prod.js"))(env) : {},
  );
  return [common, legacy];
};
module.exports = (env) => build(constants(env));
