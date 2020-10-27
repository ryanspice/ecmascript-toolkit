const webpack = require("webpack");
const path = require("path");
/** webpack.common.js */
module.exports = (env) => {
  const _maps_ = "inline-source-map";
  const _output_name_ =
    process.env.npm_package_short_name ||
    process.env.npm_package_name.replace(" ", "").toLowerCase();
  const _output_path_ = "../dist";
  const _output_filename_ = !env.legacy ? "[name].mjs" : "[name].legacy.js";
  const _chunk_filename_ = !env.legacy ? "module~[name].mjs" : "module~[name].legacy.js";
  const _chunk_filenameProd_ = !env.legacy
    ? "module~[name].[contenthash].mjs"
    : "module~[name].[contenthash].legacy.js";
  const _entry_ = {};
  _entry_[_output_name_] = ["./src/index.js", "./src/index.scss"];
  const _self_ = {};
  _self_[_output_name_] = _output_name_;

  const _externals_ = [];
  _externals_.push(_self_);

  const _output_ = env.output = {
    filename: _output_filename_,
    library: _output_name_,
    libraryTarget: "umd",
    umdNamedDefine: true,
    chunkFilename: env.production ? _chunk_filenameProd_ : _chunk_filename_,
    //chunkLoading: env.legacy ? "web" : "import-scripts",
    scriptType: env.legacy ? "text/javascript" : "module",
    path: path.resolve(__dirname, _output_path_),
    publicPath: "../",
    globalObject: "window",
  };
  return {
    mode: !env.production ? "development" : "production",
    entry: _entry_,
    output: _output_,
    externals: _externals_,
    devtool: _maps_,
    resolve: {
      extensions: [".html", ".json", ".ts", ".tsx", ".js"],
      plugins: [],
      modules: [path.resolve(__dirname, "src"), "node_modules"],
      alias: {},
    },
    plugins: [
      new webpack.DefinePlugin({
        "process.env": {
          NODE_ENV: JSON.stringify(process.env.NODE_ENV)
        },
        "typeof window": JSON.stringify("object")
      }),
      new webpack.ProvidePlugin({
        log: "LogLevel",
        env: [path.resolve("./.env"), "default"],
        pkg: [path.resolve("./package.json")],
        lang: [path.resolve("./src/lang/en.json")],
        runtime: [path.resolve("./src/utils/runtime"), "default"]
      }),
    ],
  };
};
