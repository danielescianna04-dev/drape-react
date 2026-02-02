const { withInfoPlist } = require('expo/config-plugins');

module.exports = function withAllowHTTP(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: true,
      NSAllowsLocalNetworking: true,
    };
    return config;
  });
};
