const webpack = require("webpack");
const path = require("path");
module.exports = (env) => {
  return {
    module: {
      rules: [
        { test: /\.(?:ico|gif|png|jpg|jpeg)$/i, type: "asset/resource" },
        { test: /\.(woff(2)?|eot|ttf|otf|svg|)$/, type: "asset/inline" },
        {
          test: env.tests.js,
          use: env.babel,
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
