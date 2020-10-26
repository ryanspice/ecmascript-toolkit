const webpack = require('webpack');
const path = require('path');
//const ESLintPlugin = require('eslint-webpack-plugin');
const {
	_babel_,
	_build_is_server_
} = require("./constants");
/**/
module.exports = (env) => {
	return {
		module: {
			rules: [
				// Images: Copy image files to build folder
				{test: /\.(?:ico|gif|png|jpg|jpeg)$/i, type: 'asset/resource'},
				// Fonts and SVGs: Inline files
				{test: /\.(woff(2)?|eot|ttf|otf|svg|)$/, type: 'asset/inline'},
				// JS
				{test: /\.js?$/,
					exclude: [
						// TODO :: Tidy
						// ''
						// path.resolve('./dist'),
						// path.resolve('./lib'),
						// path.resolve('./docker'),
						// path.resolve('./node_modules')
					],
					use: _babel_,
					include: [
						path.resolve('src'),
						path.resolve('test')
					]
				}
			]
		},
		plugins:[
			new webpack.IgnorePlugin({resourceRegExp: /^\.\/docker$/}),
			new webpack.IgnorePlugin({resourceRegExp: /^\.\/lib$/}),
			new webpack.IgnorePlugin({resourceRegExp: /^\.\/node_modules/}),
			new webpack.IgnorePlugin({resourceRegExp: /^\.\/dist$/}),
			new (require('clean-webpack-plugin').CleanWebpackPlugin)({
				dry: !env.legacy
			}),
			// new ESLintPlugin({
			// 	context:path.resolve(__dirname,'../src'),
			// 	failOnError:false
			// }),
			new (require("prettier-webpack-plugin"))(require(path.resolve('./config/prettier.config.js'))),

		]
	}
};
