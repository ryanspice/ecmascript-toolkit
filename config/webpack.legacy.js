const {_package_} = require("./constants");
/**
 * webpack.legacy.js
 * merges into webpack.config.babel.js, webpack-polyfill-injector and additional paramaters for legacy builds
 * @param env
 * @returns {{output: {chunkFilename: string, library: string, filename: string}, entry, plugins: PolyfillInjectorPlugin[]}[]}
 */
module.exports = function(env){
    const name = _package_.short_name;
    const PolyfillInjectorPlugin = require('webpack-polyfill-injector');
    const entry = {};
    entry[`${name}`]=`webpack-polyfill-injector?${JSON.stringify({
        modules: './src'
    })}!`;

    return {
            entry:entry,
            output:{
                library : `${name}.legacy`,
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
    ;
}
