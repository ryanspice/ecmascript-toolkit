const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const {resolve} = require("path");
/** webpack.css.js */
module.exports = (env) => {
  return {
    resolve: {
      extensions: [".scss", ".sass", ".less", ".css"],
    },
    module: {
      rules: [
        {
          test: env.tests.css,
          use: [
            !env.production
              ? "style-loader"
              : {
                  loader: MiniCssExtractPlugin.loader,
                  options: {
                    esModule: !env.legacy,
                    modules: {
                      namedExport: false,
                    },
                  },
                },
            {
              loader: "css-loader",
              options: {
                sourceMap: true,
                importLoaders:   1,
                esModule: !env.legacy,
              },
            },
            {
              loader: "postcss-loader",
              options: {
                sourceMap: true,
                postcssOptions: {
                  includePaths: [
                    'src/theme', './node_modules'
                  ],
                  plugins: {
                    "postcss-normalize": {},
                    "postcss-preset-env": {
                      "overrideBrowserslist": env.browsers,
                    },
                    "autoprefixer":{
                      'overrideBrowserslist': env.browsers
                    }
                  },
                },
              },
            },
            { loader: "sass-loader", options: { sourceMap: true } },
          ],
        },
      ],
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: !env.production ? "[name].css" : "[name].[contenthash].css",
        chunkFilename: !env.production ? "[id].css" : "[id].[contenthash].css",
      }),
    ],
  };
};
