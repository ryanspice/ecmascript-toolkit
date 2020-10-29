const proxy = process.env.proxy || null;
/**
 * proxy.config.js
 */
module.exports = {
  "/api/**": {
    target: proxy,
    secure: false,
    changeOrigin: true,
  },
  "/images/**": {
    target: proxy,
    secure: false,
    changeOrigin: true,
  },
};
