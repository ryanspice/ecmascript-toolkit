const {
	path,
	merge,
	_config_,
	_build_is_server_,
	_build_to_analyze_,
	_mode_is_production_,
} = require("./constants");
/**
 * master config all others merge into
 * @param env
 */
const build = (env) => {

	//
	const common = merge(
		require(path.resolve(__dirname, './webpack.common.js'))(env),
		require(path.resolve(__dirname, './webpack.console.js'))(env),
		require(path.resolve(__dirname, './webpack.optimization.js'))(env),
		require(path.resolve(__dirname, './webpack.rules.js'))(env),
		require(path.resolve(__dirname, './webpack.css.js'))(env),
		require(path.resolve(__dirname, './webpack.html.js'))(env),
		require(path.resolve(__dirname, './webpack.plugins.js'))(env),
		_build_to_analyze_ ? require(path.resolve(__dirname, './webpack.analyze.js'))(env) : {},
		_build_is_server_ ? require(path.resolve(__dirname, './server.config.js'))(env) : {},
		_mode_is_production_ ? require(path.resolve(__dirname, './webpack.prod.js'))(env) : {},
	);
	//

	env.legacy = true;

	const legacy = merge(
		require(path.resolve(__dirname, './webpack.common.js'))(env),
		require(path.resolve(__dirname, './webpack.console.js'))(env),
		require(path.resolve(__dirname, './webpack.optimization.js'))(env),
		require(path.resolve(__dirname, './webpack.rules.js'))(env),
		//require(path.resolve(__dirname, './webpack.css.js'))(env),
		require(path.resolve(__dirname, './webpack.html.js'))(env),
		require(path.resolve(__dirname, './webpack.plugins.js'))(env),
		require(path.resolve(__dirname, './webpack.legacy.js'))(env),
		_build_to_analyze_ ? require(path.resolve(__dirname, './webpack.analyze.js'))(env) : {},
		_build_is_server_ ? require(path.resolve(__dirname, './server.config.js'))(env) : {},
		_mode_is_production_ ? require(path.resolve(__dirname, './webpack.prod.js'))(env) : {},
	);
	//
	return [
		common,
		legacy
	];
};

module.exports = env => {
	env.development=env.development||false;
	env.production=env.production||false;
	env.legacy=env.legacy||false;
	env.static=env.static||false;
	console.log('NODE_ENV: ', env.NODE_ENV); // 'local'
	console.log('Production: ', env.production); // true
	env = merge(env,_config_);
	return build(env);
};
