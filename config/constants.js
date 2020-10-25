const webpack = require('webpack');
const path = require('path');
const {merge} = require('webpack-merge');

const _package_ = require(path.resolve(__dirname, '../package.json'));

const _mode_ = "development";
console.log(process.env)
const _proxy_ = 'https://ryanspice.com';

const _config_ = {
	legacy:false,
	webpackbar: false
};

const _settings_ = {
	webpackbar: false
};



const _mode_is_production_ = function () {
	return _mode_ === "PRODUCTION";
}();

const _mode_is_analyze_ = function () {
	return _mode_ === "ANALYZE";
}();

const _build_is_server_ = function () {
	return process.env.WEBPACK_DEV_SERVER;
}();

const _build_to_minify_ = function () {
	return true;
}();

const _build_to_analyze_ = function () {
	return false;
}();

const isHashed = true;

const _browserslist_ =  _config_.legacy ? "last 1 year, cover 92% in CA, not ie<=11" : "last 1 year, cover 10%, not ie<=11";

const _output_name_ = _package_.short_name || (_package_.name).replace(' ', '').toLowerCase();
const _output_path_ = '../dist';
const _output_filename_ = ! _config_.legacy ? `[name].mjs` : `[name].legacy.js`;

const _chunk_filename_ = ! _config_.legacy ? `module~[name].mjs` : `module~[name].legacy.js`;
const _chunk_filenameProd_ = ! _config_.legacy ? `module~[name].[contenthash].mjs` : `module~[name].[contenthash].legacy.js`;

const _self_ = {};
_self_[_output_name_] = _output_name_;
const _entry_ = {};
const _externals_ = [];
_externals_.push(_self_);

const _output_ = {
	filename: _output_filename_,
	library: _output_name_,
	libraryTarget: 'umd',
	umdNamedDefine: true,
	chunkFilename: _mode_is_production_ ? _chunk_filenameProd_ : _chunk_filename_,
	//chunkLoading: 'async-node',
	//scriptType: 'module'
	path: path.resolve(__dirname, _output_path_),
	publicPath: ("../"),//process.env.ASSET_PATH || '../',
	//globalObject: 'window',
	auxiliaryComment: {
		//root: 'Root Comment',
		//commonjs: 'CommonJS Comment',
		//commonjs2: 'CommonJS2 Comment',
		//amd: 'AMD Comment'
	}
};

const _babel_ = require(path.resolve('./config/babel.config.js'))({ _mode_is_legacy_:_config_.legacy});

// create default entry
_entry_[_output_name_] = './src/index.js';

const _default_colour_ = "#1F787F";

const _default_environment_ = {
	NODE_ENV: "development",
	production: "true"
};


let _source_maps_ = 'inline-source-map';

module.exports = {
	_package_,

	_babel_,
	_proxy_,
	_build_is_server_,
	_build_to_minify_,
	_build_to_analyze_,

	_default_colour_,
	_default_environment_,
	_mode_,
	_browserslist_, _mode_is_analyze_, _mode_is_production_,

	_output_,
	_output_name_,
	_output_path_,
	_output_filename_,
	_chunk_filename_,
	_chunk_filenameProd_,
	_self_,
	_entry_,
	_externals_,
	_source_maps_,
	_config_,
	_settings_,

	path,
	merge
};
