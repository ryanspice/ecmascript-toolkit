/**
 * prettier.config.js
 * merges into webpack.config.js, is prettier config
 */

module.exports = {
	"ignore":[
		'**/*.json',
    '**/*.txt',
		'**/*.xml',
    '**/*.svg',
	],
	"include":[
		'./config/*.js',
		'./*'
	],
	"importLoaders": 2,
	"sourceMap": true,
	//printWidth: 80,
	"encoding": 'utf-8',
	"extensions": [".js", ".ts"],
	"semi": true,
	"singleQuote": false,
	"trailingComma": "none",
	"bracketSpacing": true,
	"htmlWhitespaceSensitivity": "ignore",
	"jsxBracketSameLine": false,
	"overrides": [],
	"printWidth": 100,
	"useTabs": false,
	"tabWidth": 2,
	"arrowParens": "always"
};
