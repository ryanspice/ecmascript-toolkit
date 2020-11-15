/**
 * webpack.html.js
 *  generate html, manifest, and scripts
 */
module.exports = (env) => {
  return {
    target: env.browserslist,
    plugins: [
      new (require("html-webpack-plugin"))({
        inject: "head",
        template: "./src/index.ejs",
        headHtmlSnippet: '<link rel="manifest" href="./manifest.json">',
        bodyHtmlSnippet: "",
        contentBase: [path.join(__dirname, 'dist'), path.join(__dirname, 'assets')],
        filename: env.container,
        baseHref: "./",
        title: env.output.library,
        cache: false,
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
        inlineManifestWebpackName: env.legacy
          ? env.output.library + "ManifestLegacy"
          : env.output.library + "Manifest",
        inlineSource: ".(mjs|js|css|manifest)",
        meta: require("./meta.config.js"),
      }),
      new (require("script-ext-html-webpack-plugin"))({
        defaultAttribute: "async",
        module: !env.legacy ? env.tests.js : undefined,
        inline: !env.legacy
          ? {
              test: [
                `${env.output.library}.entry.mjs`,
                `${env.output.library}.entry.js`,
                `${env.output.library}.js`,
                `[contenthash].js`,
                `${env.output.library}.mjs`,
                `[contenthash].mjs`,
                `${env.output.library}.entry.[contenthash].js`,
                `${env.output.library}.entry.[contenthash].mjs`,
                `${env.output.library}.[contenthash].css`,
              ],
              attribute: "async",
            }
          : undefined,
      }),
      new (require("webpack-manifest-plugin"))({
        fileName: "manifest.json",
        writeToFileEmit: !env.server,
        seed: {
          short_name: env.output.library,
          name: process.env.npm_package_name,
          start_url: "/",
          background_color: env.flags.colour,
          display: "standalone",
          theme_color: `${env.flags.colour}`,
        },
        map: (file) => {
          file.name = file.name.replace(/\./g, "");
          return file;
        },
      }),
    ],
  };
};
