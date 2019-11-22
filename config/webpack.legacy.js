/**
 * webpack.legacy.js
 * merges into webpack.config.js, webpack-polyfill-injector and additional paramaters for legacy builds
 * @param env
 * @returns
 */

module.exports = function(env){

    const PolyfillInjectorPlugin = require('webpack-polyfill-injector');
    const name = require("../package.json").short_name;
    const entry = {};

    entry[`${name}`]=`webpack-polyfill-injector?${JSON.stringify({
        modules: './src' // list your entry modules for the `app` entry chunk
    })}!`; // don't forget the trailing exclamation mark!

    return[
        {
            entry:entry,
            output:{
                library : `${name}_legacy`,
                chunkFilename : `[name].legacy.js`,
                filename : `[name].legacy.js`,
            },
            plugins:[
                new PolyfillInjectorPlugin({
                    minify:true,
                    singleFile:true,
                    filename:`polyfill.js`,
                    polyfills: require('./polyfills.js')
                })
            ]
        }
    ];
}
