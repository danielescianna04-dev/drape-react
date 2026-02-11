const { withInfoPlist } = require('expo/config-plugins');

module.exports = function withAllowHTTP(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.NSAppTransportSecurity = {
      // Do NOT allow arbitrary loads — Apple rejects this
      NSAllowsArbitraryLoads: false,
      // Allow HTTP in WebViews only (for preview content)
      NSAllowsArbitraryLoadsInWebContent: true,
      NSAllowsLocalNetworking: true,
      NSExceptionDomains: {
        'drape.info': {
          NSExceptionAllowsInsecureHTTPLoads: false, // Only HTTPS
          NSIncludesSubdomains: true,
        },
      },
    };
    return config;
  });
};
