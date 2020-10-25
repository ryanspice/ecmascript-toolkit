const {_build_to_minify_} = require("./constants");
/**
 * server.config.js
 * all devServer options
 */
module.exports = {
	devServer:{
		//bonjour: true,
		"proxy": require('./proxy.config'),
		"historyApiFallback": true,
		//writeToDisk: true,
		//"contentBase": "./dist",
		//"contentBase": false,
		//"hot": true,
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
