module.exports = {
	plugins: {
		"postcss-normalize": {},
		'postcss-preset-env': {
			browsers: 'last 1 year, cover 99% in CA, not ie<=11',
		},
		"autoprefixer": {}
	},
}
