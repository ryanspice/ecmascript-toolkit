const { resolve } = require("path");
const { DefinePlugin, ProvidePlugin } = require("webpack");
/** webpack.common.js */
module.exports = (env) => {
  return {
    mode: "development",
    stats: env.stats,
    entry: env.entry,
    output: env.output,
    externals: env.externals,
    devtool: env.maps,
    resolveLoader:{
     modules:[
       resolve(__dirname, "../node_modules"),
       "node_modules"
     ]
    },
    resolve: {
      extensions: [".html", ".json", ".ts", ".tsx", ".js", ".mjs"],
      plugins: [],
      modules: [
        resolve(__dirname, "src"),
        resolve(__dirname, "../node_modules"),
        "node_modules"],
      alias: {
        components: resolve(__dirname, "src/components"),
        '@toolkit': resolve(__dirname, "../config"),
        '@toolkit': resolve(__dirname, "../src")
      },
    },
    plugins: [
      new DefinePlugin({
        "process.env": {
          NODE_ENV: JSON.stringify(process.env.NODE_ENV),
        },
        "typeof window": JSON.stringify("object"),
      }),
      new ProvidePlugin({
        log: "LogLevel",
        env: [resolve("./.env"), "default"],
        pkg: [resolve("./package.json")],
        lang: [resolve("./src/lang/en.json")],
        runtime: [resolve("./src/utils/runtime"), "default"],
      }),
    ],
  };
};
