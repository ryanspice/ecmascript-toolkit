module.exports = function (env) {
  return {
    mode: "production",
    devtool: "source-map",
    plugins: [new (require("webpack").optimize.ModuleConcatenationPlugin)()],
  };
};
