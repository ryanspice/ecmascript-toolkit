/**
 * webpack.analyze.js
 * merges config/webpack.master.js, and adds BundleAnalyzerPlugin
 * @param env
 * @returns {{mode, devtool, output, entry, performance, resolve, optimization, plugins, module, externals}[]}
 */
module.exports = function(env){

    const config = require("./webpack.master");
    const analyzer = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

    /*
    const WebpackVisualizerPlugin = require("webpack-visualizer-plugin");
    new WebpackVisualizerPlugin();
    */

    const build = config(env);

    // merge analyzer plugin

    env.analyze?build.plugins.push(new analyzer({
        "analyzerMode":env.static?'static':'server',
        "excludeAssets":[
            "node_modules",
            "./node_modules"
        ]
    })):null;

    return [build];
}
