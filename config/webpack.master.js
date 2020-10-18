/**
 * webpack.master.js
 * master config all others merge into
 * @param evt
 * @returns {{mode: string, devtool: string, output: {chunkFilename: string, jsonpFunction: string, libraryTarget: string, path: string, filename: string, library, umdNamedDefine: boolean, globalObject: string}, entry, performance: {maxEntrypointSize: number, maxAssetSize: number, hints: *}, resolve: {extensions: string[], plugins: Array, alias: {}, modules: string[]}, optimization: {moduleIds: string, chunkIds: string, usedExports: boolean, runtimeChunk: {name: (function(*): string)}}, plugins: Array, module: {rules: {include: string[], test: RegExp, use: {loader: string, options: {presets: *[], sourceType: string, plugins: *[]}}, exclude: string[]}[]}, externals: Array}}
 */
const build = evt=>{

	const type = 'standard';

	let env = {
		NODE_ENV: "development",
		production: "true"
	};

	const path = require('path');
	const settings = require('./webpack.settings.js');
	const package = require("../package.json");
	const overrideName = package.short_name || "[name]";
	const name = package.short_name || "[name]";
	const outputName = package.short_name;

	const isHashed = true;
	const isLegacy = type!=="legacy"?true:false;


	const outputFilename = isLegacy?`[name].js`:`[name].legacy.js`;
	const chunkFilename = isLegacy?`module~[name].js`:`module~[name].legacy.js`;
	const chunkFilenameProd = isLegacy?`module~[name].[contenthash].js`:`module~[name].[contenthash].legacy.js`;

	// create default entry
	const entry = {}; entry[outputName] = './src';
	// create default external in configs, useful for use with external projects
	const self = {};
	self[outputName] = outputName;
	const externals = [];
	externals.push(self);

	return {

		mode: 'development',

		devtool: settings.devtool,

		externals:externals,

		entry: entry,

		output:{
			//compareBeforeEmit: false,
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
			hints:env.production?false:'warning',
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
						path.resolve('./node_modules')

					],

					use: require(path.resolve('./babel.config.js')),

					include: [


						//TODO :: Tidy

						path.resolve('src'),
						path.resolve('test')
					]

				}

			]

		},

		plugins:[]
    };
};

module.exports = build;
