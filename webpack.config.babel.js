const { resolve } = require("path");

module.exports = (env) =>
  require(resolve(__dirname, "./config/webpack.master.js"))(env);
