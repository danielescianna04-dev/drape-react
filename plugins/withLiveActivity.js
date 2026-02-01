const { withInfoPlist, withXcodeProject, withEntitlementsPlist } = require('@expo/config-plugins');
const path = require('path');

/**
 * Expo config plugin per aggiungere Live Activities support (Dynamic Island)
 */
const withLiveActivity = (config) => {
  // 1. Aggiungi supporto Live Activities all'Info.plist
  config = withInfoPlist(config, (config) => {
    config.modResults.NSSupportsLiveActivities = true;
    return config;
  });

  // 2. Aggiungi entitlements per push notifications se necessario
  config = withEntitlementsPlist(config, (config) => {
    if (!config.modResults['com.apple.developer.usernotifications.push-notifications']) {
      config.modResults['com.apple.developer.usernotifications.push-notifications'] = ['alert', 'badge', 'sound'];
    }
    return config;
  });

  return config;
};

module.exports = withLiveActivity;
