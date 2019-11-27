/**
 * webpack.prod.js
 * merges into webpack.config.js, additional prod values/plugins
 * @param env
 * @returns {{mode: string, devtool: string, stats: {assets: boolean, children: boolean, chunks: boolean, timings: boolean, chunkModules: boolean, colors: boolean, hash: boolean, modules: boolean}, optimization: {minimizer: Array}, plugins: (ModuleConcatenationPlugin|any)[]}[]}
 */

module.exports = function(env){
    const webpack = require('webpack');
    //const OptimizeCSSAssetsPlugin = require("optimize-css-assets-webpack-plugin");
    return [
        {
            mode: 'production',
            devtool: 'source-map',
            stats: {
                colors: true,
                hash: true,
                timings: true,
                assets: true,
                chunks: true,
                chunkModules: true,
                modules: true,
                children: true,
            },
            plugins: [
                //new webpack.NamedModulesPlugin(),
                new webpack.optimize.ModuleConcatenationPlugin(),
                //new webpack.optimize.OccurrenceOrderPlugin(true)
            ],
            optimization: {
                minimizer: [
                    /*
                    new OptimizeCSSAssetsPlugin({
                        assetNameRegExp: /\.optimize\.css$/g,
                        cssProcessor: require('cssnano'),
                        cssProcessorPluginOptions: {
                            preset: ['default', {
                                discardComments: {
                                    removeAll: true
                                }
                            }],
                        },
                        canPrint: true
                    })
                    */
                ]
            }
        }
    ];
}
