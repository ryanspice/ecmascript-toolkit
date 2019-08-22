module.exports = {
	//"proxy": require('./webpack.proxy'),
	"historyApiFallback": true,
	"contentBase": "./dist",
	"hot": false,
	"inline": true,
	"compress": false,
	"stats": {
	  "assets": true,
	  "children": true,
	  "chunks": true,
	  "hash": true,
	  "modules": true,
	  "publicPath": false,
	  "timings": true,
	  "version": true,
	  "warnings": true,
	  "colors": {
	     "green": "#012456"
	  }
	}
}
