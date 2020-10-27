const log = require("loglevel");
log.enableAll();
const { _package_, _settings_} = require("./constants");
module.exports = (env) => {
  if (env.production) {
    return {};
  }
  return {
    plugins: [
      new (require("webpackbar"))({
        //color:_default_colour_,
        profile: env.analyze,
        fancy: _settings_.webpackbar,
        // start(context) {
        //
        // 	// Called when (re)compile is started
        //
        // },
        //
        // change(context) {
        //
        // 	// Called when a file changed on watch mode
        //
        // },
        //
        // update(context) {
        //
        // 	// Called after each progress update
        //
        // },
        //
        // done(context) {
        //
        // 	// Called when compile finished
        //
        // },
        //
        // progress(context) {
        //
        // 	// Called when build progress updated
        //
        // },
        //
        // allDone(context) {
        //
        // 	// Called when _all_ compiles finished
        //
        // },
        //
        // beforeAllDone(context) {
        //
        // },
        //
        // afterAllDone(context) {
        //
        // },
      }),
      new (require("webpack-messages"))({
        name: _package_.name,
        logger: function (str) {
          log.info(`>> ${str}`);
        },
        // onComplete: function(name){
        // 	log.info(`${name}`);
        // }
      }),
    ],
  };
};
