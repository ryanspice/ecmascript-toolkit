
const path = require('path');
const {_mode_is_production_} = require("./constants");

/**
 */
module.exports = (env) =>{
	const MiniCssExtractPlugin = require('mini-css-extract-plugin');
	return {
		resolve: {
			extensions: ['.scss', '.sass', '.less', '.css'],
		},
		// Inject CSS into the head with source maps, or use MiniCssExtractPlugin
		module: {
			rules: [
				{
					test: /\.(sa|sc|c)ss$/,
					use: [
						!env.production ? 'style-loader' : {
							loader:MiniCssExtractPlugin.loader,
							options: {
								esModule: !env.legacy,
								modules: {
									namedExport: !env.legacy,
								},
								// publicPath: (resourcePath, context) => {
								// 	// publicPath is the relative path of the resource to the context
								// 	// e.g. for ./css/admin/main.css the publicPath will be ../../
								// 	// while for ./css/main.css the publicPath will be ../
								// 	return path.relative(path.dirname(resourcePath), context) + '/';
								// },
							},
						},
						{loader: 'css-loader', options: {sourceMap: true, importLoaders: 1,
								esModule: !env.legacy,
								modules: {
									namedExport: !env.legacy,
									//localIdentName: 'foo__[name]__[local]',
								}
							}
						},
						{loader: 'postcss-loader', options: {sourceMap: true, postcssOptions:{
									plugins: {
										//"postcss-normalize": {},
										'postcss-preset-env': {
											browsers: env.legacy ?
												"last 1 year, cover 92% in CA, not ie<=10" : "supports es6-module",
										},
										"autoprefixer": {}
									},
								}}},
						{loader: 'sass-loader', options: { sourceMap: true}},
					],
				},
			]
		},
		// Extracts CSS into separate files
		// Note: style-loader is for development, MiniCssExtractPlugin is for production
		plugins: [
			new MiniCssExtractPlugin({
				// Options similar to the same options in webpackOptions.output
				// both options are optional
				//filename: env.production ? '[name].css' : '[name].[contenthash].css',
				filename: !env.production ? '[name].css' : '[name].[hash].css',
				chunkFilename: !env.production ? '[id].css' : '[id].[hash].css',
				//filename: ({ chunk }) => `${chunk.name.replace('/js/', '/css/')}.[contenthash].css`,
				//chunkFilename: env.production ? '[id].css' : '[id].[contenthash].css',
			}),
			//new webpack.HotModuleReplacementPlugin()
		],
	}
};