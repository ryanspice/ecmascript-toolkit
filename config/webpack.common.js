const webpack = require('webpack');
const path = require('path');
const {
	_entry_,
	_output_,
	_externals_,
	_source_maps_,
} = require("./constants");
/**
 */
module.exports = (config) =>{
	return {
		mode: 'development',
		entry: _entry_,
		output: _output_,
		externals: _externals_,
		devtool: _source_maps_,
		resolve: {
			extensions: ['.html','.json','.ts','.tsx', '.js'] ,
			plugins: [],
			modules: [
				path.resolve(__dirname, 'src'),
				'node_modules',
			],
			alias: { }
		},
		plugins: [
			new webpack.DefinePlugin({
				'process.env': {
					NODE_ENV: JSON.stringify(process.env.NODE_ENV)
				},
				'typeof window': JSON.stringify('object'),
			}),
			new webpack.ProvidePlugin({
				"log": 'LogLevel',
				"env": [
					path.resolve('./.env'), 'default'
				],
				"pkg": [
					path.resolve('./package.json')
				],
				"lang": [
					path.resolve('./src/lang/en.json')
				],
				"runtime": [
					path.resolve('./src/utils/runtime'), 'default'
				]
			}),
			// TODO: later version?
			//new webpack.HotModuleReplacementPlugin(),
			// Copies files from target to destination folder
			// new (require('copy-webpack-plugin'))({
			// 	patterns: [
			// 		{
			// 			from: paths.public,
			// 			to: 'assets',
			// 			globOptions: {
			// 				ignore: ['*.DS_Store'],
			// 			},
			// 		},
			// 	],
			// }),
		],
	}
};
