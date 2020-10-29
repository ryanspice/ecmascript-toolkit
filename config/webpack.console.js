/** webpack.console.js */
module.exports = (env) => {
  return {
    plugins: [
      new (require("webpack-messages"))({
        name: env.output.library,
        logger: function (str) {
          env.log.info(`>> ${str}`);
        },
        onComplete: function (name) {
          env.log.info(`${name}`);
        },
      }),
    ],
  };
};
