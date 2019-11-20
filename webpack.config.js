/**/

const merge = require('webpack-merge');
const name = require("./package.json").short_name;
const entry = {};
entry[name] = `./src`;

/**/

const app = (env) => {
    return merge(
        require('./config/webpack.master.js')(env),
        {
            entry:entry,
            output:{
                library : name,
                chunkFilename : `[name].js`,
                filename : `[name].js`
            }
        }
    );
};

/**/

module.exports = app();
