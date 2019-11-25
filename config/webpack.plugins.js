/**
 * webpack.plugins.js
 * merged in webpack.config.js, all additional plugins
 * @type {{plugins: DuplicatePackageCheckerPlugin[]}}
 */

module.exports = {
    plugins:[
        new (require("duplicate-package-checker-webpack-plugin"))({
            verbose: true,
            strict: true
        }),
        new (require('circular-dependency-plugin'))({
            // exclude detection of files based on a RegExp
            exclude: /a\.js|node_modules/,
            // include specific files based on a RegExp
            include: /src/,
            // add errors to webpack instead of warnings
            failOnError: true,
            // allow import cycles that include an asyncronous import,
            // e.g. via import(/* webpackMode: "weak" */ './file.js')
            allowAsyncCycles: false,
            // set the current working directory for displaying module paths
            cwd: process.cwd(),
        }),
        new (require("babel-minify-webpack-plugin"))(require('./webpack.minify.config.js'))
    ]
}
