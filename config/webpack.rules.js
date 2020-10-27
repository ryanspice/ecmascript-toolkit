const webpack = require("webpack");
const path = require("path");
const { _babel_ } = require("./constants");
module.exports = (env) => {
  return {
    module: {
      rules: [
        { test: /\.(?:ico|gif|png|jpg|jpeg)$/i, type: "asset/resource" },
        { test: /\.(woff(2)?|eot|ttf|otf|svg|)$/, type: "asset/inline" },
        {
          test: /\.(mjs|js)?$/,
          use: _babel_,
          include: [path.resolve("src"), path.resolve("test")],
        },
      ],
    },
    plugins: [
      new webpack.IgnorePlugin({ resourceRegExp: /^\.\/docker$/ }),
      new webpack.IgnorePlugin({ resourceRegExp: /^\.\/lib$/ }),
      new webpack.IgnorePlugin({ resourceRegExp: /^\.\/node_modules/ }),
      new webpack.IgnorePlugin({ resourceRegExp: /^\.\/dist$/ }),
      new (require("clean-webpack-plugin").CleanWebpackPlugin)({
        dry: env.legacy && !env.server,
      }),
      new (require("prettier-webpack-plugin"))(
        require(path.resolve("./config/prettier.config.js")),
      ),
    ],
  };
};
