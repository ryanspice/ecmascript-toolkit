
const webpack = require('webpack')
const path = require('path')


const WebpackBar = require('webpackbar');
const WebpackMessages = require('webpack-messages');

const CopyWebpackPlugin = require('copy-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')

const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const OptimizeCssAssetsPlugin = require('optimize-css-assets-webpack-plugin')
const TerserPlugin = require('terser-webpack-plugin')
var ManifestPlugin = require('webpack-manifest-plugin');
var PrettierPlugin = require("prettier-webpack-plugin");
//const {CleanWebpackPlugin} = require('clean-webpack-plugin')
/**
 * webpack.config.js
 * entry config, merges all others
 * @param env
 * @returns {Array}
 */

module.exports = {

	// Set the mode to development or production
	mode: 'development',

	// Control how source maps are generated
	devtool: 'inline-source-map',

	// Spin up a server for quick development
	devServer: {
		historyApiFallback: true,
		open: true,
		compress: true,
		hot: true,
		port: 8080,
	},

	entry: {
		main: path.resolve(__dirname, './src/index.js'),
	},
	output: {
		path: path.resolve(__dirname, './dist'),
		filename: '[name].bundle.js',
	},
	plugins: [
		new PrettierPlugin({
			//printWidth: 80,               // Specify the length of line that the printer will wrap on.
			tabWidth: 2,                  // Specify the number of spaces per indentation-level.
			useTabs: false,               // Indent lines with tabs instead of spaces.
			semi: true,                   // Print semicolons at the ends of statements.
			encoding: 'utf-8',            // Which encoding scheme to use on files
			extensions: [ ".js", ".ts" ]  // Which file extensions to process
		}),
		new WebpackBar(),
		new WebpackMessages({
			name: 'client',
			logger: str => console.log(`>> ${str}`)
		}),
		new webpack.HotModuleReplacementPlugin(),
//		new CleanWebpackPlugin(),
		new HtmlWebpackPlugin({
			title: 'webpack Boilerplate',
			template: path.resolve(__dirname, './src/template.html'), // template file
			filename: 'index.html', // output file
		}),
		// Copies files from target to destination folder
		// new CopyWebpackPlugin({
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
		// Extracts CSS into separate files
		// Note: style-loader is for development, MiniCssExtractPlugin is for production
		new MiniCssExtractPlugin({
			filename: 'styles/[name].[contenthash].css',
			chunkFilename: '[id].css',
		}),

		//new ManifestPlugin()
	],
	module: {
		rules: [
			// Styles: Inject CSS into the head with source maps
			// {
			// 	test: /\.(scss|css)$/,
			// 	use: [
			// 		'style-loader',
			// 		{loader: 'css-loader', options: {sourceMap: true, importLoaders: 1}},
			// 		{loader: 'postcss-loader', options: {sourceMap: true}},
			// 		{loader: 'sass-loader', options: {sourceMap: true}},
			// 	],
			// },
			{
				test: /\.(scss|css)$/,
				use: [
					MiniCssExtractPlugin.loader,
					{
						loader: 'css-loader',
						options: {
							importLoaders: 2,
							sourceMap: false,
						},
					},
					'postcss-loader',
					'sass-loader',
				],
				include:[
					path.resolve("./template.scss"),
				]
			},

			// Images: Copy image files to build folder
			{test: /\.(?:ico|gif|png|jpg|jpeg)$/i, type: 'asset/resource'},

			// Fonts and SVGs: Inline files
			{test: /\.(woff(2)?|eot|ttf|otf|svg|)$/, type: 'asset/inline'},

			/*
			 *	JS + Flowtype Support
			 */

			{

				test: /\.js?$/,

				exclude:[

					// TODO :: Tidy
					// ''
					path.resolve('./dist'),
					path.resolve('./lib'),
					path.resolve('./docker'),
					path.resolve('./node_modules')

				],

				use: {

					loader: "babel-loader?cacheDirectory",

					options: {

						"sourceType": "module",

						"presets": [

							[

								"@babel/preset-env", {

								"modules": 'umd',

								"useBuiltIns": false,

								"shippedProposals": true, // not sure about this one

								"targets": {

									"browsers": false === "legacy" ? "last 1 year, cover 97% in CA, not ie<=11" : "cover 20% in CA, not ie<11"
									//"browsers":"> 2%, not dead, not IE 11"
									//	,"esmodules":type != "legacy"?true:false // This seems to create a larger bundle???

								},

								//"loose": true

							}

							],

							"@babel/flow",

							["minify", {
								builtIns: false,
								evaluate: false,
								mangle: false,
							}]
						],

						"plugins": [

							/* doesn work with babael 7 :()

							[
								"flow-runtime", {
									"assert": true,
									"annotate": true
								}
							],

							*/

							[
								"@babel/plugin-transform-runtime",
								{
									"absoluteRuntime": true,
									"corejs": false,
									"helpers": true,
									"regenerator": true,
									"useESModules": true
								}
							],
							"@babel/plugin-proposal-optional-chaining",
							["@babel/plugin-proposal-decorators", {
								"legacy": true
							}],
							"@babel/plugin-proposal-function-sent",
							"@babel/plugin-proposal-export-namespace-from",
							["@babel/plugin-proposal-object-rest-spread",{"useBuiltIns":true}],
							"@babel/plugin-proposal-export-default-from",
							"@babel/plugin-proposal-numeric-separator",
							"@babel/plugin-proposal-throw-expressions",
							"@babel/plugin-syntax-dynamic-import",
							"@babel/plugin-syntax-import-meta",
							"@babel/plugin-syntax-flow",
							[
								"@babel/plugin-proposal-class-properties", {
								//"loose": false,
								"ignoreUninitialized":	true
							}
							],
							"@babel/plugin-proposal-json-strings",
							"@babel/plugin-proposal-private-methods"
						]

					}

				},

				include: [


					//TODO :: Tidy

					path.resolve('src'),
					path.resolve('test')
				]

			}
		],
	},
	optimization: {
		minimize: true,
		minimizer: [new OptimizeCssAssetsPlugin(), new TerserPlugin({
			terserOptions: {

				output: {

					comments: false,

				},

			},

			extractComments: false,
		})],
		// Once your build outputs multiple chunks, this option will ensure they share the webpack runtime
		// instead of having their own. This also helps with long-term caching, since the chunks will only
		// change when actual code changes, not the webpack runtime.
		runtimeChunk: {
			name: 'runtime',
		},
	},
	performance: {
		hints: false,
		maxEntrypointSize: 512000,
		maxAssetSize: 512000,
	},

}
