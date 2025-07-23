const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Proxy API requests
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://backend:3001',
      changeOrigin: true,
    })
  );

  // Proxy WebSocket connections
  app.use(
    '/ws',
    createProxyMiddleware({
      target: 'ws://backend:3002',
      ws: true,
      changeOrigin: true,
      pathRewrite: {
        '^/ws': '/', // Remove /ws prefix when forwarding to backend
      },
      onError: (err, req, res) => {
        console.log('WebSocket proxy error:', err);
      },
      logLevel: 'debug'
    })
  );
};