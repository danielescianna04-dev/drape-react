const { withInfoPlist, withXcodeProject, withEntitlementsPlist } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

/**
 * Expo config plugin per aggiungere Live Activities support (Dynamic Island)
 * - Aggiunge NSSupportsLiveActivities a Info.plist
 * - Aggiunge push notification entitlements
 * - Aggiunge il Widget Extension target al progetto Xcode
 */
const withLiveActivity = (config) => {
  // 1. Aggiungi supporto Live Activities all'Info.plist
  config = withInfoPlist(config, (config) => {
    config.modResults.NSSupportsLiveActivities = true;
    return config;
  });

  // 2. Aggiungi entitlements per push notifications
  config = withEntitlementsPlist(config, (config) => {
    if (!config.modResults['aps-environment']) {
      config.modResults['aps-environment'] = 'production';
    }
    return config;
  });

  // 3. Aggiungi Widget Extension target al progetto Xcode
  config = withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const projectRoot = config.modRequest.projectRoot;

    const widgetExtName = 'PreviewWidgetExtension';
    const widgetBundleId = 'com.bynot.app.PreviewWidgetExtension';
    const widgetExtPath = path.join(projectRoot, 'ios', widgetExtName);

    // Skip if widget extension files don't exist
    if (!fs.existsSync(widgetExtPath)) {
      console.log(`[withLiveActivity] Widget extension directory not found at ${widgetExtPath}, skipping...`);
      return config;
    }

    // Check if target already exists
    const existingTarget = xcodeProject.pbxTargetByName(widgetExtName);
    if (existingTarget) {
      console.log(`[withLiveActivity] Widget extension target already exists, skipping...`);
      return config;
    }

    console.log(`[withLiveActivity] Adding ${widgetExtName} target...`);

    // Add widget extension target
    const widgetTarget = xcodeProject.addTarget(
      widgetExtName,
      'app_extension',
      widgetExtName,
      widgetBundleId
    );

    // Add source files to widget target
    const widgetFiles = [
      'PreviewWidgetExtensionBundle.swift',
      'PreviewLiveActivity.swift',
    ];

    // Also add shared PreviewActivityAttributes.swift from main app
    const sharedFiles = [
      { name: 'PreviewActivityAttributes.swift', path: path.join('Bynot', 'PreviewActivityAttributes.swift') },
    ];

    const widgetGroup = xcodeProject.addPbxGroup(
      widgetFiles.map(f => path.join(widgetExtName, f)),
      widgetExtName,
      widgetExtName
    );

    // Add files to widget target build phase
    for (const file of widgetFiles) {
      xcodeProject.addSourceFile(
        path.join(widgetExtName, file),
        { target: widgetTarget.uuid },
        widgetGroup.uuid
      );
    }

    // Add shared file to widget target
    for (const shared of sharedFiles) {
      xcodeProject.addSourceFile(
        shared.path,
        { target: widgetTarget.uuid },
        undefined
      );
    }

    // Set build settings for widget extension
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      const config_entry = configurations[key];
      if (config_entry.buildSettings && config_entry.baseConfigurationReference === undefined) {
        // Check if this belongs to our widget target
        const name = config_entry.name;
        if (typeof config_entry.buildSettings === 'object' && config_entry.buildSettings.PRODUCT_BUNDLE_IDENTIFIER === widgetBundleId) {
          config_entry.buildSettings.SWIFT_VERSION = '5.0';
          config_entry.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = '16.1';
          config_entry.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
          config_entry.buildSettings.GENERATE_INFOPLIST_FILE = 'YES';
          config_entry.buildSettings.INFOPLIST_FILE = `${widgetExtName}/Info.plist`;
          config_entry.buildSettings.CODE_SIGN_STYLE = 'Automatic';
          config_entry.buildSettings.CURRENT_PROJECT_VERSION = '1';
          config_entry.buildSettings.MARKETING_VERSION = '1.5.1';
        }
      }
    }

    // Add widget extension to main app's embed frameworks build phase
    xcodeProject.addBuildPhase(
      [],
      'PBXCopyFilesBuildPhase',
      'Embed App Extensions',
      xcodeProject.getFirstTarget().uuid,
      'app_extension'
    );

    return config;
  });

  return config;
};

module.exports = withLiveActivity;
