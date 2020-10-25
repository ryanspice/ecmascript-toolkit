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
const build = (env = _config_) => {
	console.log(process.env.production)
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
	env.legacy = true;
	const legacy = merge(
		require(path.resolve(__dirname, './webpack.common.js'))(env),
		require(path.resolve(__dirname, './webpack.console.js'))(env),
		require(path.resolve(__dirname, './webpack.optimization.js'))(env),
		require(path.resolve(__dirname, './webpack.rules.js'))(env),
		require(path.resolve(__dirname, './webpack.css.js'))(env),
		require(path.resolve(__dirname, './webpack.html.js'))(env),
		require(path.resolve(__dirname, './webpack.plugins.js'))(env),
		require(path.resolve(__dirname, './webpack.legacy.js'))(env),
		_build_to_analyze_ ? require(path.resolve(__dirname, './webpack.analyze.js'))(env) : {},
		_build_is_server_ ? require(path.resolve(__dirname, './server.config.js'))(env) : {},
		_mode_is_production_ ? require(path.resolve(__dirname, './webpack.prod.js'))(env) : {},
	);
	return [
		common,
		legacy
	];
};
module.exports = build;
