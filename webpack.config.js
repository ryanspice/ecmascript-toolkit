/**/

const merge = require('webpack-merge');
const name = require("./package.json").short_name;
const entry = {};
entry[name] = `./src/index.js`;
const builds = [];

/**/

const app = (env) => {

    // override env for parallel-webpack implementation

    if (!env)
        env = {};

    process.argv.forEach(e=>{
        e.indexOf("=")>0?
            env[
                e.split('=')[0].replace('--','').replace('env.','')
                ] = e.split('=')[1]:null;
    });

    // merge configuration scripts together based on flags

    const config = {
        mode:env.production?'production':'development',
        entry:entry,
        output:{
            libraryExport:`[name]`,
            library : name,
            chunkFilename : `[name].js`,
            filename : `[name].js`
        }
    };

    // STANDARD

    //(!env.legacy || (env.legacy && env.production)) ?
    true?builds.push(merge(
        require('./config/webpack.settings.js'),
        require('./config/webpack.server.js'),
        env.analyze?require('./config/webpack.analyze.js')(env)[0]:require('./config/webpack.master.js')(env),
        require('./config/webpack.plugins.js')(env),
        env.production?require('./config/webpack.prod.js')(env)[0]:{},
        //config
    )):null;

    if (true){
        //console.log(builds[0].entry);
        //console.log(builds[0].output);
        return builds;
    }

    // LEGACY

    env.legacy?
        builds.push(merge(
            require('./config/webpack.settings.js'),
            require('./config/webpack.server.js'),
            env.analyze?require('./config/webpack.analyze.js')(env)[0]:require('./config/webpack.master.js')(env),
            require('./config/webpack.plugins.js')(env),
            env.production?require('./config/webpack.prod.js')(env)[0]:{},
            config,
            env.legacy?require('./config/webpack.legacy.js')(env)[0]:{}
        )):null;
    return builds;
};

/**/

module.exports = app();
