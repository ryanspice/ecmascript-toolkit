const {
	_build_is_server_,
	_build_to_minify_,
	_default_colour_,
	_output_name_,
	_package_,
} = require("./constants");
/**
 * webpack.html.js
 *  generate html, manifest, and scripts
 */
module.exports = (env) => {
	return {
		plugins:[
			new (require('html-webpack-plugin'))({
				inject: 'head',
				template: ('./src/index.ejs'),
				headHtmlSnippet: `<link rel="manifest" href="./manifest.json">`,
				bodyHtmlSnippet:``,
				fileName: `index.html`,
				baseHref: `./`,
				title: _output_name_,
				//cache: false,
				minify: _build_to_minify_?{
					collapseWhitespace: true,
					removeComments: true,
					removeRedundantAttributes: true,
					removeScriptTypeAttributes: true,
					removeStyleLinkTypeAttributes: true,
					useShortDoctype: true
				}:false,
				// scripts: scripts[0] || [],
				inlineManifestWebpackName: _output_name_ + 'Manifest',
				inlineSource: '.(js|css|manifest)',
				meta:require('./meta.config.js')
			}),
			new (require("script-ext-html-webpack-plugin"))({
				defaultAttribute: 'async',
				preload: /\.js$/,
				module: !env.legacy?/\.js$/:null,
				// prefetch: /\.js$/,
				inline:[
					// `${name}.entry.js`
				],
				custom: _build_is_server_?[
					{
						test: /\.js$/,
						attribute: 'crossorigin',
						value: 'anonymous',
					}
				]:null
			}),
			new (require('webpack-manifest-plugin'))({
				fileName: `manifest.json`,
				writeToFileEmit:!_build_is_server_,
				seed: {
					"short_name": _package_.short_name,
					"name": _package_.name,
					"start_url": `/`,
					"background_color": _default_colour_,
					"display": "standalone",
					"theme_color": `${_default_colour_}00`,
				},
				map: (file) => {
					file.name = file.name.replace(/\./g, '');
					return file;
				}
			}),
		]
	}
};
