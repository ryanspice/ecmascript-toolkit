
/**
 * webpack.config.babel.js
 * entry config, merges all others
 * @param env
 * @returns {Array}
 */

const app = async env => {

  	env = getDefaultEnvState(env);

    const merge = require('webpack-merge');
    const name = require("./package.json").short_name;
    const entry = {};
    entry[name] = `./src/index.js`;
    const builds = [];

    // override env for parallel-webpack implementation
    process.argv.forEach(e=>{
        const x = e.split('=')[0].replace('--','').replace('env.','');
        const y = e.split('=')[1];
        e.indexOf("=")>0?env[x] = y:null;
    });

    // merge configuration scripts together based on flags
    const config = {
        mode:env.production?'production':'development',
        entry:entry,
        output:{
            library : name,
            chunkFilename : `[name].js`,
            filename : `[name].js`
        }
    };

    // standard build
    (!env.legacy || (env.legacy && env.production))?
        builds.push(merge(
            require('./config/webpack.settings.js'),
            require('./config/server.config.js'),
            env.analyze?require('./config/webpack.analyze.js')(env)[0]:require('./config/webpack.master.js')(env),
            require('./config/webpack.plugins.js')(env),
            env.production?require('./config/webpack.prod.js')(env)[0]:{},
            config
        )):null;
    /*
        // legacy build
        env.legacy?
            builds.push(merge(
                require('./config/webpack.settings.js'),
                require('./config/server.config.js'),
                env.analyze?require('./config/webpack.analyze.js')(env)[0]:require('./config/webpack.master.js')(env),
                require('./config/webpack.plugins.js')(env),
                env.production?require('./config/webpack.prod.js')(env)[0]:{},
                config,
                env.legacy?require('./config/webpack.legacy.js')(env)[0]:{}
            )):null;
    */
    return builds;
};

/**/

function getDefaultEnvState(env) {

    return env?env:{
        legacy: false,
        production: false
    };

};

/**/

module.exports = app;
