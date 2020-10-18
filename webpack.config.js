const webpack = require('webpack')
const path = require('path')


const WebpackBar = require('webpackbar');
const WebpackMessages = require('webpack-messages');

const CopyWebpackPlugin = require('copy-webpack-plugin')

const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const OptimizeCssAssetsPlugin = require('optimize-css-assets-webpack-plugin')
const TerserPlugin = require('terser-webpack-plugin')
var ManifestPlugin = require('webpack-manifest-plugin');
var PrettierPlugin = require("prettier-webpack-plugin");


const isLegacy = false !== "legacy" ? true : false;

const {CleanWebpackPlugin} = require('clean-webpack-plugin')

// Try the environment variable, otherwise use root
const ASSET_PATH = process.env.ASSET_PATH || '/';


const _default_colour_ = "#1F787F"
const _default_settings_ = require('./config/webpack.settings.js');
const _default_environment_ = {
	NODE_ENV: "development",
	production: "true"
};

const _package_ = path.resolve(__dirname, './package.js');

const _output_name_ = _package_.short_name;
const _output_path_ = './dist';
const _output_filename_ = isLegacy ? `[name].js` : `[name].legacy.js`;

const _chunk_filename_ = isLegacy ? `module~[name].js` : `module~[name].legacy.js`;
const _chunk_filenameProd_ = isLegacy ? `module~[name].[contenthash].js` : `module~[name].[contenthash].legacy.js`;

const _self_ = {};
const _entry_ = {};
const _externals_ = [];

// create default entry
_entry_[_output_name_] = './src/index.js';

// create default external in configs, useful for use with external projects
//_self_[_output_name_] = _output_name_;
//_externals_.push(_self_);

/**
 * webpack.config.js
 * entry config, merges all others
 * @param env
 * @returns {Array}
 */

module.exports = (env = _default_environment_) => {
	return {
		// Set the mode to development or production
		mode: 'development',
		// Control how source maps are generated
		devtool: _default_settings_.devtool,
		//
		externals: _externals_,
		//
		entry: _entry_,
		//
		output: {
			publicPath: ASSET_PATH,
			filename: _output_filename_,
			library: _output_name_,
			libraryTarget: 'umd',
			umdNamedDefine: true,
			chunkFilename: _chunk_filename_,
			path: path.resolve(__dirname, _output_path_),
			globalObject: 'window'
		},
		//
		performance: {
			hints: false,
			maxEntrypointSize: 512000,
			maxAssetSize: 512000,
		},
		//
		optimization: {
			chunkIds: 'deterministic', //named
			moduleIds: 'deterministic',
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
			usedExports: true,
		},
		//
		resolve: {

			extensions: ['.html','.json','.ts','.tsx', '.js', '.scss', '.css'],

			plugins: [],

			modules: [
				'./src',
				'node_modules'
			],

			alias: { }

		},
		//
		plugins: [
			new CleanWebpackPlugin(),
			new webpack.DefinePlugin({
				'process.env.ASSET_PATH': JSON.stringify(ASSET_PATH) ,
			}),
			new PrettierPlugin(require(path.resolve('./config/prettier.config.js'))),
			new WebpackBar(),
			new WebpackMessages({
				name: 'client',
				logger: str => console.log(`>> ${str}`)
			}),
			//new webpack.HotModuleReplacementPlugin(),

			new (require("duplicate-package-checker-webpack-plugin"))({
				verbose: true,
				strict: true
			}),
			new (require('circular-dependency-plugin'))({
				exclude: /a\.js|node_modules|.ejs|index.js/, // excludes index and ejs as false positives were being flagged
				include: /src/,
				failOnError: true,
				allowAsyncCycles: false, // e.g. via import(/* webpackMode: "weak" */ './file.js')
				cwd: process.cwd(), // set the current working directory for displaying module paths
			}),
			new (require("babel-minify-webpack-plugin"))(env.production?require(path.resolve('./config/minify.config.js')):{}),
			new (require('html-webpack-plugin'))({
				inject: 'head',
				template: ('./src/index.ejs'),
				//headHtmlSnippet: `<link rel="manifest" href="./manifest.json">`,
				bodyHtmlSnippet:``,
				fileName: `index.html`,
				baseHref: `./`,
				title: _output_name_,
				cache: false,
				minify: env.production?{
					collapseWhitespace: true,
					removeComments: true,
					removeRedundantAttributes: true,
					removeScriptTypeAttributes: true,
					removeStyleLinkTypeAttributes: true,
					useShortDoctype: true
				}:false,
				// scripts: scripts[0] || [],
				inlineManifestWebpackName: _output_name_ + 'Manifest',
				inlineSource: '.(js|css)',
				meta:{
					'viewport': 'width=device-width, initial-scale=1, shrink-to-fit=no',
					'theme-color': '#252525'
				}
			}),
			new (require("script-ext-html-webpack-plugin"))({
				//defaultAttribute: 'async',
				preload: /\.js$/,
				module: /\.js$/,
				// prefetch: /\.js$/,
				inline:[
					// `${name}.entry.js`
				],
				custom: [
					{
						test: /\.js$/,
						attribute: 'crossorigin',
						value: 'anonymous'
					}
				]
			}),
			/* CURRENTLY BREAKS :: NEEDS TO BE UPDATED TO WEBPACK 4+
			new (require('flow-webpack-plugin'))({
					failOnError: false,
					failOnErrorWatch: false,
					reportingSeverity: 'warning',
					printFlowOutput: false,
					flowPath: require.main.require('flow-bin'),
					flowArgs: ['--color=always', '--include-warnings'],
					verbose: false,
					callback: (...args) => {

							return true;
					}
			})
			 */
			new (require('webpack-manifest-plugin'))({

				fileName: `manifest.json`,
				writeToFileEmit:true,
				seed: {
					"short_name": _output_name_,
					"name": _package_.name,
					"start_url": `/`,
					"background_color": _default_colour_,
					"display": "standalone",
					"theme_color": _default_colour_,

				},

				map: (file) => {

					file.name = file.name.replace(/\./g, '');
					return file;
				}

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
			// new MiniCssExtractPlugin({
			// 	filename: 'styles/[name].[contenthash].css',
			// 	chunkFilename: '[id].css',
			// }),
			new webpack.IgnorePlugin({resourceRegExp: /^\.\/docker$/}),
			new webpack.IgnorePlugin({resourceRegExp: /^\.\/lib$/}),
			new webpack.IgnorePlugin({resourceRegExp: /^\.\/node_modules/}),
			new webpack.IgnorePlugin({resourceRegExp: /^\.\/dist$/}),
			//new ManifestPlugin()
		],
		//
		module: {

			rules: [

				// Styles: Inject CSS into the head with source maps
				{
					test: /\.(scss|css)$/,
					use: [
						'style-loader',
						{loader: 'css-loader', options: {sourceMap: true, importLoaders: 1}},
						{loader: 'postcss-loader', options: {sourceMap: true}},
						{loader: 'sass-loader', options: {sourceMap: true}},
					],
				},
				// {
				// 	test: /\.(scss|css)$/,
				// 	use: [
				// 		MiniCssExtractPlugin.loader,
				// 		{
				// 			loader: 'css-loader',
				// 			options: {
				// 				importLoaders: 2,
				// 				sourceMap: false,
				// 			},
				// 		},
				// 		'postcss-loader',
				// 		'sass-loader',
				// 	],
				// 	include: [
				// 		path.resolve("./template.scss"),
				// 	]
				// },

				// Images: Copy image files to build folder
				{test: /\.(?:ico|gif|png|jpg|jpeg)$/i, type: 'asset/resource'},

				// Fonts and SVGs: Inline files
				{test: /\.(woff(2)?|eot|ttf|otf|svg|)$/, type: 'asset/inline'},

				/*
				 *	JS + Flowtype Support
				 */
				{

					test: /\.js?$/,

					exclude: [

						// TODO :: Tidy
						// ''
						path.resolve('./dist'),
						path.resolve('./lib'),
						path.resolve('./docker'),
						path.resolve('./node_modules')

					],

					use: require(path.resolve('./config/babel.config.js')),

					include: [


						//TODO :: Tidy

						path.resolve('src'),
						path.resolve('test')
					]

				}
			],
		},
		// Spin up a server for quick development
		devServer: {
			historyApiFallback: true,
			open: true,
			compress: true,
			hot: true,
			port: 8080,
		}
	}
}
