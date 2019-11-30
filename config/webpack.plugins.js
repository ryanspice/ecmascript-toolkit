/**
 * webpack.plugins.js
 * merged in webpack.config.js, all additional plugins
 * @type {{plugins: DuplicatePackageCheckerPlugin[]}}
 */

module.exports = env => {
    const name = require(`../package`).short_name;
    return{
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
            new (require("babel-minify-webpack-plugin"))(env.production?require('./webpack.minify.config.js'):{}),
            new (require('html-webpack-plugin'))({
                inject: 'head',
                template: ('./src/index.ejs'),
                /*
                headHtmlSnippet: `
                    <link rel="manifest" href="manifest.json">
                    <style>

                        html {
                            background:#252525;
                        height: 100%;
                        }

                        body {
                            background:transparent;
                            display:inline-block;
                            width:100%;
                            height:100%;
                            margin:0px;
                        }

                        .spinner {
                            position: absolute;
                            left: 50%;
                            top: 35%;
                            margin: 0px auto;
                            margin-left: -25px;
                            width: 50px;
                        }

                        watermark {
                            position: fixed;
                            bottom: 5px;
                            right: 5px;
                            opacity: 0.5;
                            z-index: 99;
                            color: rgba(25, 25, 25, 0.75);
                        }

                        loader {
                            width: 100%;
                            height: 100%;
                            position: fixed;
                            left: 0px;
                            top: 0px;
                            z-index: 10;
                            text-align: center;
                        }

                         @-moz-keyframes spin { 100% { -moz-transform: rotate(360deg); } }
                         @-webkit-keyframes spin { 100% { -webkit-transform: rotate(360deg); } }
                         @keyframes spin { 100% { -webkit-transform: rotate(360deg); transform:rotate(360deg); } }

                        spinner {
                        height: 111px;
                        width: 111px;
                        background-color: transparent;
                        border-radius: 50%;
                        display: inline-block;
                        -webkit-animation: spin 1s linear infinite;
                        -moz-animation: spin 1s linear infinite;
                        animation: spin 1s linear infinite;
                        box-shadow: 0px 2px 0 0 rgba(255,255,255,0.25);
                        }

                    </style>
                `,
                bodyHtmlSnippet:`
                    <loader>
                        <spinner></spinner>
                        <message></message>
                    </loader>
                `,

                 */
                fileName: `index.html`,
                baseHref: `./`,
                title: `${name}`,
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
            })
        ]
    }

};
