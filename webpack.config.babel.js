
const {
	path,
	_default_environment_
} = require("./config/constants");

/**
 */

module.exports = (env = _default_environment_) =>
	require(path.resolve(__dirname, './config/webpack.master.js'))(env);

