const { _default_colour_ } = require("./constants");
/**
 * webpack.html.js
 *  generate html, manifest, and scripts
 */
module.exports = (env) => {
  return {
    plugins: [
      new (require("html-webpack-plugin"))({
        inject: "head",
        template: "./src/index.ejs",
        headHtmlSnippet: '<link rel="manifest" href="./manifest.json">',
        bodyHtmlSnippet: "",
        fileName: env.legacy?`index.tts`:`index.html`,
        filename: "index.[contenthash].html",
        baseHref: "./",
        title: env.output.library,
        //cache: false,
        minify: env.production
          ? {
              collapseWhitespace: true,
              removeComments: true,
              removeRedundantAttributes: true,
              removeScriptTypeAttributes: true,
              removeStyleLinkTypeAttributes: true,
              useShortDoctype: true,
            }
          : false,
        // scripts: scripts[0] || [],
        inlineManifestWebpackName: env.output.library + "Manifest",
        inlineSource: ".(mjs|js|css|manifest)",
        meta: require("./meta.config.js"),
      }),
      new (require("script-ext-html-webpack-plugin"))({
        defaultAttribute: "async",
        preload: /\.(mjs|js)$/,
        module: !env.legacy ? /\.(mjs|js)$/ : null,
        //module: /\.(mjs|js)$/,
        prefetch: /\.js$/,
        inline: [`${env.output.library}.entry.js`],
        custom: env.server
          ? [
              {
                test: /\.(mjs|js)$/,
                attribute: "crossorigin",
                value: "anonymous",
              },
            ]
          : null,
      }),
      new (require("webpack-manifest-plugin"))({
        fileName: "manifest.json",
        writeToFileEmit: !env.server,
        seed: {
          short_name: env.output.library,
          name: process.env.npm_package_name,
          start_url: "/",
          background_color: _default_colour_,
          display: "standalone",
          theme_color: `${_default_colour_}00`,
        },
        map: (file) => {
          file.name = file.name.replace(/\./g, "");
          return file;
        },
      }),
    ],
  };
};
