const MiniCssExtractPlugin = require("mini-css-extract-plugin");
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
                      browsers: env.browsers,
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
    ],
  };
};
