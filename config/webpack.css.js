/**
 * webpack.css.js
 * Inject CSS into the head with source maps, or use MiniCssExtractPlugin
 */
module.exports = (env) => {
  const MiniCssExtractPlugin = require("mini-css-extract-plugin");
  return {
    resolve: {
      extensions: [".scss", ".sass", ".less", ".css"],
    },
    module: {
      rules: [
        {
          test: /\.(scss|css)$/,
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
                importLoaders: 1,
                esModule: !env.legacy,
                modules: {
                  namedExport: false,
                },
              },
            },
            {
              loader: "postcss-loader",
              options: {
                sourceMap: true,
                postcssOptions: {
                  plugins: {
                    "postcss-normalize": {},
                    "postcss-preset-env": {
                      browsers: env.legacy
                        ? "last 1 year, cover 92% in CA, not ie<=10"
                        : "supports es6-module",
                    },
                    autoprefixer: {},
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
      //new webpack.HotModuleReplacementPlugin()
    ],
  };
};
