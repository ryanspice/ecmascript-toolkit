const {_proxy_} = require("./constants");
/**
 * proxy.config.js
 * defaults to ryanspice.come TODO: remove in post alpha builds (externalize?)
 * @type {{"/api/**": {changeOrigin: boolean, secure: boolean, target: string}, "/images/**": {changeOrigin: boolean, secure: boolean, target: string}}}
 */
module.exports ={
	 '/api/**': {
		 target: _proxy_,
		 secure: false,
		 changeOrigin: true
	 },
	 '/images/**': {
		 target: _proxy_,
		 secure: false,
		 changeOrigin: true
	 }
}
