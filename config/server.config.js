const {_build_to_minify_} = require("./constants");
/**
 * webpack.server.js
 * merged in webpack.config.babel.js, all devServer options
 * @type {{devServer: {historyApiFallback: boolean, inline: boolean, compress: boolean, stats: {assets: boolean, children: boolean, chunks: boolean, warnings: boolean, timings: boolean, publicPath: boolean, version: boolean, hash: boolean, modules: boolean}, after: module.exports.devServer.after, hot: boolean, watchOptions: {ignored: string[]}}}}
 */
module.exports = {
	devServer:{
		//bonjour: true,
		"proxy": require('./proxy.config'),
		"historyApiFallback": true,
		//writeToDisk: true,
		//"contentBase": "./dist",
		//"contentBase": false,
		"hot": true,
		"inline": true,
		"compress": _build_to_minify_,
		"stats": {
		  "assets": true,
		  "children": false,
		  "chunks": true,
		  "hash": true,
		  "modules": true,
		  "publicPath": false,
		  "timings": true,
		  "version": false,
		  "warnings": true,
		},
		watchOptions: {
			ignored: [
				"node_modules",
				"dist",
				"config",
			]
		},
		//after: function(app, server, compiler) {}
	}
};
