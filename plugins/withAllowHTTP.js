const { withInfoPlist } = require('expo/config-plugins');

module.exports = function withAllowHTTP(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: true,
      NSAllowsLocalNetworking: true,
      NSAllowsArbitraryLoadsInWebContent: true,
      NSExceptionDomains: {
        '77.42.1.116': {
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSIncludesSubdomains: true,
        },
      },
    };
    return config;
  });
};
