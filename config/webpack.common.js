const webpack = require("webpack");
const path = require("path");

/** webpack.common.js */
module.exports = (env) => {
  return {
    mode: !env.production && !env.release ? "development" : "production",
    entry: env.entry,
    output: env.output,
    externals: env.externals,
    devtool: env.maps,
    resolve: {
      extensions: [".html", ".json", ".ts", ".tsx", ".js", ".mjs"],
      plugins: [],
      modules: [path.resolve(__dirname, "src"), "node_modules"],
      alias: {},
    },
    plugins: [
      new webpack.DefinePlugin({
        "process.env": {
          NODE_ENV: JSON.stringify(process.env.NODE_ENV),
        },
        "typeof window": JSON.stringify("object"),
      }),
      new webpack.ProvidePlugin({
        log: "LogLevel",
        env: [path.resolve("./.env"), "default"],
        pkg: [path.resolve("./package.json")],
        lang: [path.resolve("./src/lang/en.json")],
        runtime: [path.resolve("./src/utils/runtime"), "default"],
      }),
    ],
  };
};
