
/**
 * webpack.plugins.js
 * merged in webpack.config.js, all additional plugins
 * @type {{}}
 */
module.exports = env => {
    const pkg = require(`../package`);
    const name = pkg.short_name;
    return{
        plugins:[
            new (require("duplicate-package-checker-webpack-plugin"))({
                verbose: true,
                strict: true
            }),
            new (require('circular-dependency-plugin'))({
                exclude: /a\.js|node_modules|.ejs|index.js/, // excludes index and ejs as false positives were being flagged
                include: /src/,
                failOnError: true,
                allowAsyncCycles: false, // e.g. via import(/* webpackMode: "weak" */ './file.js')
                cwd: process.cwd(), // set the current working directory for displaying module paths
            }),
            new (require("babel-minify-webpack-plugin"))(env.production?require('./minify.config.js'):{}),
            new (require('html-webpack-plugin'))({
                inject: 'head',
                template: ('./src/index.ejs'),
                //headHtmlSnippet: `<link rel="manifest" href="./manifest.json">`,
                bodyHtmlSnippet:``,
                fileName: `index.html`,
                baseHref: `./`,
                title: name,
                cache: false,
                minify: env.production?{
                    collapseWhitespace: true,
                    removeComments: true,
                    removeRedundantAttributes: true,
                    removeScriptTypeAttributes: true,
                    removeStyleLinkTypeAttributes: true,
                    useShortDoctype: true
                }:false,
               // scripts: scripts[0] || [],
                inlineManifestWebpackName: name + 'Manifest',
                inlineSource: '.(js|css)',
                meta:{
                    'viewport': 'width=device-width, initial-scale=1, shrink-to-fit=no',
                    'theme-color': '#252525'
                }
            }),
            new (require("script-ext-html-webpack-plugin"))({
                //defaultAttribute: 'async',
                preload: /\.js$/,
                module: /\.js$/,
               // prefetch: /\.js$/,
                inline:[
                   // `${name}.entry.js`
                ],
                custom: [
                    {
                        test: /\.js$/,
                        attribute: 'crossorigin',
                        value: 'anonymous'
                    }
                ]
            }),
            /* CURRENTLY BREAKS :: NEEDS TO BE UPDATED TO WEBPACK 4+
            new (require('flow-webpack-plugin'))({
                failOnError: false,
                failOnErrorWatch: false,
                reportingSeverity: 'warning',
                printFlowOutput: false,
                flowPath: require.main.require('flow-bin'),
                flowArgs: ['--color=always', '--include-warnings'],
                verbose: false,
                callback: (...args) => {

                    return true;
                }
            })
             */
            new (require('webpack-manifest-plugin'))({

                fileName: `manifest.json`,

                seed: {
                    "short_name": pkg.short_name,
                    "name": pkg.name,
                    "start_url": ``,
                    "background_color": "#3367D6",
                    "display": "standalone",
                    "orientation": "landscape",
                    "scope": "/",
                    "theme_color": "#3367D6",

                },

                map: (file) => {

                    file.name = file.name.replace(/\./g, '');
                    return file;
                }

            })
        ]
    }
};
