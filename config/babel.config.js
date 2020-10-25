/**
 * bable.config.js
 * merges into webpack.config.babel.js, is babel config
 */
const {_mode_is_legacy_} = require("./constants");
const {_browserslist_} = require("./constants");
module.exports = ()=> {
	return {
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
							"browsers": _browserslist_,
							//"esmodules": !_mode_is_legacy_
						},
						//"loose": true
					}
				],
				"@babel/flow",
				[
					"minify",
					{
						builtIns: false,
						evaluate: false,
						mangle: false,
					}
				]
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
				["@babel/plugin-proposal-object-rest-spread", {"useBuiltIns": true}],
				"@babel/plugin-proposal-export-default-from",
				"@babel/plugin-proposal-numeric-separator",
				"@babel/plugin-proposal-throw-expressions",
				"@babel/plugin-syntax-dynamic-import",
				"@babel/plugin-syntax-import-meta",
				"@babel/plugin-syntax-flow",
				[
					"@babel/plugin-proposal-class-properties", {
					//"loose": false,
					"ignoreUninitialized": true
				}
				],
				"@babel/plugin-proposal-json-strings",
				"@babel/plugin-proposal-private-methods"
			]

		}

	};
};
