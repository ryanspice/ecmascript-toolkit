const {} = require("./constants");
/**
 */
module.exports = () =>{
	return {
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
		]},
		resolve: {
			//extensions: ['.scss', '.sass', '.less', '.css'],
		},
		plugins: [
			// Extracts CSS into separate files
			// Note: style-loader is for development, MiniCssExtractPlugin is for production
			// new MiniCssExtractPlugin({
			// 	filename: 'styles/[name].[contenthash].css',
			// 	chunkFilename: '[id].css',
			// }),
		],
	}
};
