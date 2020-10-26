module.exports = ()=>{
	return {
		performance: {
			hints: "warning",
			maxEntrypointSize: 512000,
			maxAssetSize: 512000,
			// hints:env.production?false:'warning',
			// maxEntrypointSize: true?1560000:560000,
			// maxAssetSize: true?1500000:500000
		},
		optimization: {
			splitChunks: {
				chunks: 'all',
				//minSize: 20000,
				//minRemainingSize: 0,
				//maxSize: 0,
				//minChunks: 1,
				//maxAsyncRequests: 30,
				//maxInitialRequests: 30,
				automaticNameDelimiter: '~',
				cacheGroups: {
					styles: {
						name: 'styles',
						test: /\.css$/,
						chunks: 'all',
						enforce: true,
					},
				},
			},
			chunkIds: 'deterministic',
			moduleIds: 'deterministic',
			runtimeChunk: {
				name: entrypoint => `${entrypoint.name}.entry`
			},
			minimize: true,
			minimizer: [
				new (require('terser-webpack-plugin'))({
					terserOptions: {
						output: {
							comments: false,
						},
					},
					extractComments: false,
				})
			],
			usedExports: true,
		},
		plugins:[
			new (require('optimize-css-assets-webpack-plugin'))({
				assetNameRegExp: /\.optimize.css$/g,
				cssProcessor: require('cssnano'),
				cssProcessorPluginOptions: {
					preset: ['default', {
						discardComments: {
							removeAll: true
						}
					}],
				},
				canPrint: true
			}),
		]
	}
};
