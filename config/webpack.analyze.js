/**/

const config = require("./webpack.master");
const build = config();
const analyzer = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

/**/

build.plugins.push(new analyzer({
    "excludeAssets":[
        "node_modules"
    ]
}));

/**/

module.exports = [build];
