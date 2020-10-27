const _proxy_ = process.env.proxy || null;
/**
 * proxy.config.js
 */
module.exports = {
  "/api/**": {
    target: _proxy_,
    secure: false,
    changeOrigin: true,
  },
  "/images/**": {
    target: _proxy_,
    secure: false,
    changeOrigin: true,
  },
};
