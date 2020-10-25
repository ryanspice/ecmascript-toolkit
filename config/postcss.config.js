const {_browserslist_} = require("./constants");
module.exports = {
	plugins: {
		"postcss-normalize": {},
		'postcss-preset-env': {
			browsers: _browserslist_,
		},
		"autoprefixer": {}
	},
}
