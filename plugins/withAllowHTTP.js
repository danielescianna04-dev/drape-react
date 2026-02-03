const { withInfoPlist } = require('expo/config-plugins');

module.exports = function withAllowHTTP(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: true,
      NSAllowsLocalNetworking: true,
      NSAllowsArbitraryLoadsInWebContent: true,
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
