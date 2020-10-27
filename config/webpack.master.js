const { path, merge, _config_ } = require("./constants");
/**
 * master config all others merge into
 * @param env
 */
const build = (env) => {
  //
  const common = merge(
    require(path.resolve(__dirname, "./webpack.common.js"))(env),
    require(path.resolve(__dirname, "./webpack.console.js"))(env),
    require(path.resolve(__dirname, "./webpack.optimization.js"))(env),
    require(path.resolve(__dirname, "./webpack.rules.js"))(env),
    require(path.resolve(__dirname, "./webpack.css.js"))(env),
    require(path.resolve(__dirname, "./webpack.html.js"))(env),
    require(path.resolve(__dirname, "./webpack.plugins.js"))(env),
    env.analyze ? require(path.resolve(__dirname, "./webpack.analyze.js"))(env) : {},
    env.server ? require(path.resolve(__dirname, "./server.config.js"))(env) : {},
    env.production ? require(path.resolve(__dirname, "./webpack.prod.js"))(env) : {},
  );
  //

  env.legacy = true;

  const legacy = merge(
    require(path.resolve(__dirname, "./webpack.common.js"))(env),
    require(path.resolve(__dirname, "./webpack.console.js"))(env),
    require(path.resolve(__dirname, "./webpack.optimization.js"))(env),
    require(path.resolve(__dirname, "./webpack.rules.js"))(env),
    require(path.resolve(__dirname, "./webpack.css.js"))(env),
    require(path.resolve(__dirname, "./webpack.html.js"))(env),
    require(path.resolve(__dirname, "./webpack.plugins.js"))(env),
    require(path.resolve(__dirname, "./webpack.legacy.js"))(env),
    env.analyze ? require(path.resolve(__dirname, "./webpack.analyze.js"))(env) : {},
    env.server ? require(path.resolve(__dirname, "./server.config.js"))(env) : {},
    env.production ? require(path.resolve(__dirname, "./webpack.prod.js"))(env) : {},
  );
  //
  return [common, legacy];
  //return [common];
};

module.exports = (env) => {
  env.development = env.development || true;
  env.production = env.production || false;
  env.legacy = env.legacy || false;
  env.static = env.static || false;
  env.server = env.server || false;
  env.analyze = env.analyze || false;
  env.output = {};
  //console.log('NODE_ENV: ', env.NODE_ENV); // 'local'
  //console.log('Production: ', env.production); // true
  env = merge(env, _config_);
  return build(env);
};
