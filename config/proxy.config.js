/**
 * proxy.config.js
 * defaults to ryanspice.come TODO: remove in post alpha builds (externalize?)
 * @type {{"/api/**": {changeOrigin: boolean, secure: boolean, target: string}, "/images/**": {changeOrigin: boolean, secure: boolean, target: string}}}
 */
module.exports ={
	 '/api/**': {
		 target: 'https://ryanspice.com',
		 secure: false,
		 changeOrigin: true
	 },
	 '/images/**': {
		 target: 'https://ryanspice.com',
		 secure: false,
		 changeOrigin: true
	 }
}
