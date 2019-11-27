/**
 * webpack.server.js
 * merged in webpack.config.js, all devServer options
 * @type {{devServer: {historyApiFallback: boolean, inline: boolean, compress: boolean, stats: {assets: boolean, children: boolean, chunks: boolean, warnings: boolean, timings: boolean, publicPath: boolean, version: boolean, hash: boolean, modules: boolean}, after: module.exports.devServer.after, hot: boolean, watchOptions: {ignored: string[]}, contentBase: string}}}
 */
module.exports = {
	devServer:{
		//bonjour: true,
		//"proxy": require('./webpack.proxy'),
		"historyApiFallback": true,
		//writeToDisk: true,
		//"contentBase": "./dist",
		//"contentBase": false,
		"hot": false,
		"inline": true,
		"compress": false,
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
			ignored: ["node_modules"]
		},
		after: function(app, server, compiler) {
			// do fancy stuff
			//console.log('[Etk] server start');
		}
	}
};
