
const path = require('path');
const webpack = require('webpack');
const merge = require('webpack-merge');
const assign = (a,b) => {return Object.assign(a,b)};
//

// TODO :: remove unnecessary plugins_custom

/*
const ManifestPlugin = require('webpack-manifest-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
*/

//const analyze = require("./webpack.analyze.js");





// TODO :: make sure that we only query the type once
//
const type = 'standard';

let env = {
NODE_ENV: "development",
production: "true"
};

// export master config, merging custom_config

const build = evt=>{

	const settings = require('./webpack.settings.js');
	const package = require("../package.json");
	const overrideName = package.short_name || "[name]";
	const outputName = package.short_name;

	// TODO :: set names of output based on need

	const isHashed = true;
	const isLegacy = type!=="legacy"?true:false;

	const outputFilename = isLegacy?`[name].js`:`[name].legacy.js`;
	const chunkFilename = isLegacy?`module~[name].js`:`module~[name].legacy.js`;
	const chunkFilenameProd = isLegacy?`module~[name].[contenthash].js`:`module~[name].[contenthash].legacy.js`;


	// TODO :: replace this assign with a deep merging method (webpack merge?)
	// create default entry
	// create default entry file name based on the package_shortname
	const entry = {}; entry[package.short_name] = './src';

	// create default external in configs, useful for use with external projects
	const self = {}
	self[outputName] = outputName;
	const externals = [];
	externals.push(self);

	return {

		mode: 'development',

		devtool: settings.devtool,

		externals:externals,

		entry: entry,

		output:{
			filename: outputFilename,
			library: outputName,
			libraryTarget: 'umd',
			umdNamedDefine: true,
			chunkFilename: isHashed?env.production?chunkFilenameProd:chunkFilename:chunkFilename,
			jsonpFunction: 'json'+outputName,
			path: path.resolve(`./dist`),
    		globalObject: 'window'
		},

		performance: {
			hints:'warning',
			maxEntrypointSize: true?1560000:560000,
			maxAssetSize: true?1500000:500000
		},

		optimization: {
			chunkIds: 'deterministic', //named
			moduleIds: 'deterministic',
			runtimeChunk: {
				name: entrypoint => `${entrypoint.name}.entry`
			},
			usedExports: true,
		},

		resolve: {

			extensions: ['.html','.json','.ts','.tsx', '.js', '.scss', '.css'],

			plugins: [],

			modules: [
				'./src',
				'node_modules'
			],

			alias: { }

		},

		module: {

			rules: [

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
						path.resolve('./node_modules'),
						path.resolve('../async.2018/node_modules'),
						path.resolve('../async-2018/node_modules')

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

											"browsers": type == "legacy" ? "last 1 year, cover 97% in CA, not ie<=11" : "cover 20% in CA, not ie<11"
											//"browsers":"> 2%, not dead, not IE 11"
											//	,"esmodules":type != "legacy"?true:false // This seems to create a larger bundle???

										},

										//"loose": true

									}

								],

								"@babel/flow"

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
							]

						}

					},

					include: [


						//TODO :: Tidy

						path.resolve('src'),
						path.resolve('src/*.js'),
						path.resolve('src/**/*.js'),
						path.resolve('test'),
						path.resolve('async.2018/src/*.js'),
						path.resolve('async.2018/src/**/*.js'),
						path.resolve('async.2018/config/*.js'),
						path.resolve('async.2018/config/**/*.js')
					]

				}

			]

		},

    };

/**
			 * legacy


			if (type != "legacy"){

				const FlowWebpackPlugin = require('flow-webpack-plugin');

				bundle.plugins.push(new FlowWebpackPlugin({
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
				}));

				let scripts = (require('./script.files'))();


				bundle.plugins.push(

					new HtmlWebpackPlugin({

						//required

						inject: false,
						template: ('./src/index.ejs'),

						//html

						headHtmlSnippet: `

							<link rel="manifest" href="manifest.json">
							<style>

								html {
									background:#252525;
		    					height: 100%;
								}

								body {
									background:transparent;
									display:inline-block;
									width:100%;
									height:100%;
									margin:0px;
								}

								.spinner {
									position: absolute;
									left: 50%;
									top: 35%;
									margin: 0px auto;
									margin-left: -25px;
									width: 50px;
								}

								watermark {
									position: fixed;
									bottom: 5px;
									right: 5px;
									opacity: 0.5;
									z-index: 99;
									color: rgba(25, 25, 25, 0.75);
								}

								loader {
									width: 100%;
									height: 100%;
									position: fixed;
									left: 0px;
									top: 0px;
									z-index: 10;
									text-align: center;
								}

								 @-moz-keyframes spin { 100% { -moz-transform: rotate(360deg); } }
								 @-webkit-keyframes spin { 100% { -webkit-transform: rotate(360deg); } }
								 @keyframes spin { 100% { -webkit-transform: rotate(360deg); transform:rotate(360deg); } }

								spinner {
							    height: 111px;
							    width: 111px;
							    background-color: transparent;
							    border-radius: 50%;
							    display: inline-block;
							    -webkit-animation: spin 1s linear infinite;
							    -moz-animation: spin 1s linear infinite;
							    animation: spin 1s linear infinite;
							    box-shadow: 0px 2px 0 0 rgba(255,255,255,0.25);
								}

							</style>
						`,
						bodyHtmlSnippet:`
							<loader>
								<spinner></spinner>
								<message></message>
							</loader>
						`,
						//

						fileName: `index.html`,
						baseHref: `./`,
						title: package.name,
						cache: true,
						minify: true,

						//

						scripts: scripts[0] || [],
						inlineManifestWebpackName: package.short_name + 'Manifest',
						inlineSource: '.(js|css)',

						//

						meta:{
							'viewport': 'width=device-width, initial-scale=1, shrink-to-fit=no',
							'theme-color': '#252525'
						}

					}
				));


				//Manifest

				bundle.plugins.push(new ManifestPlugin({

					fileName: `manifest.json`,

					seed: Object.assign({
						"short_name": package.short_name,
						"name": package.name,
						"start_url": ``,
						"background_color": "#3367D6",
						"display": "standalone",
						"orientation": "landscape",
						"scope": "/",
						"theme_color": "#3367D6",

					},scripts[1]),

					map: (file) => {

						file.name = file.name.replace(/\./g, '');
						return file;
					}

				}));


			};
*/
};

module.exports = build;
