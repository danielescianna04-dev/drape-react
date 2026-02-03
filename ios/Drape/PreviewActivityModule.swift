import Foundation
import ActivityKit
import UserNotifications

// PreviewActivityAttributes is defined in PreviewActivityAttributes.swift (shared with widget extension)
// RCTPromiseResolveBlock and RCTPromiseRejectBlock are imported via Drape-Bridging-Header.h

@objc(PreviewActivityModule)
class PreviewActivityModule: NSObject {

  private var currentActivity: Any? = nil

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc
  static func moduleName() -> String {
    return "PreviewActivityModule"
  }

  // MARK: - Live Activity Methods

  @objc
  func startActivity(
    _ projectName: String,
    operationType: String,
    remainingSeconds: Int,
    currentStep: String,
    progress: Double,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.1, *) else {
      rejecter("UNSUPPORTED", "Live Activities require iOS 16.1+", nil)
      return
    }

    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      rejecter("DISABLED", "Live Activities are disabled", nil)
      return
    }

    // End any existing activity first
    if let activity = currentActivity as? Activity<PreviewActivityAttributes> {
      Task {
        await activity.end(dismissalPolicy: .immediate)
      }
    }

    let attributes = PreviewActivityAttributes(
      projectName: projectName,
      operationType: operationType
    )

    let initialState = PreviewActivityAttributes.ContentState(
      remainingSeconds: remainingSeconds,
      currentStep: currentStep,
      progress: progress,
      projectName: projectName,
      operationType: operationType
    )

    do {
      let activity = try Activity.request(
        attributes: attributes,
        contentState: initialState,
        pushType: nil
      )
      currentActivity = activity
      resolver(activity.id)
    } catch {
      rejecter("START_FAILED", error.localizedDescription, error)
    }
  }

  @objc
  func updateActivity(
    _ remainingSeconds: Int,
    currentStep: String,
    progress: Double,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.1, *) else {
      rejecter("UNSUPPORTED", "Live Activities require iOS 16.1+", nil)
      return
    }

    guard let activity = currentActivity as? Activity<PreviewActivityAttributes> else {
      rejecter("NO_ACTIVITY", "No active Live Activity", nil)
      return
    }

    let updatedState = PreviewActivityAttributes.ContentState(
      remainingSeconds: remainingSeconds,
      currentStep: currentStep,
      progress: progress,
      projectName: activity.attributes.projectName,
      operationType: activity.attributes.operationType
    )

    Task {
      await activity.update(using: updatedState)
      resolver(true)
    }
  }

  @objc
  func endActivity(
    _ resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.1, *) else {
      resolver(false)
      return
    }

    guard let activity = currentActivity as? Activity<PreviewActivityAttributes> else {
      resolver(false)
      return
    }

    Task {
      await activity.end(dismissalPolicy: .immediate)
      currentActivity = nil
      resolver(true)
    }
  }

  @objc
  func endActivityWithSuccess(
    _ projectName: String,
    message: String,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.1, *) else {
      resolver(false)
      return
    }

    guard let activity = currentActivity as? Activity<PreviewActivityAttributes> else {
      resolver(false)
      return
    }

    // Update to success state before ending
    let successState = PreviewActivityAttributes.ContentState(
      remainingSeconds: 0,
      currentStep: message,
      progress: 1.0,
      projectName: projectName,
      operationType: "complete"
    )

    Task {
      await activity.update(using: successState)
      // Wait a moment to show the success state
      try? await Task.sleep(nanoseconds: 1_500_000_000) // 1.5 seconds
      await activity.end(dismissalPolicy: .default)
      currentActivity = nil
      resolver(true)
    }
  }

  // MARK: - Notification Methods

  @objc
  func requestNotificationPermission(
    _ resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
      if let error = error {
        rejecter("PERMISSION_ERROR", error.localizedDescription, error)
      } else {
        resolver(granted)
      }
    }
  }

  @objc
  func sendLocalNotification(
    _ title: String,
    body: String,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default

    // Try to add app icon as attachment
    if let iconURL = self.getAppIconURL() {
      do {
        let attachment = try UNNotificationAttachment(identifier: "appIcon", url: iconURL, options: nil)
        content.attachments = [attachment]
      } catch {
        print("⚠️ Could not attach icon: \(error)")
      }
    }

    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)
    let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: trigger)

    UNUserNotificationCenter.current().add(request) { error in
      if let error = error {
        rejecter("NOTIFICATION_ERROR", error.localizedDescription, error)
      } else {
        resolver(true)
      }
    }
  }

  // Helper to get app icon URL for notifications
  private func getAppIconURL() -> URL? {
    // Try to find the app icon in the bundle
    guard let iconsDictionary = Bundle.main.infoDictionary?["CFBundleIcons"] as? [String: Any],
          let primaryIconsDictionary = iconsDictionary["CFBundlePrimaryIcon"] as? [String: Any],
          let iconFiles = primaryIconsDictionary["CFBundleIconFiles"] as? [String],
          let lastIcon = iconFiles.last,
          let iconURL = Bundle.main.url(forResource: lastIcon, withExtension: "png") else {

      // Fallback: try to copy AppIcon from assets to temp directory
      if let appIconImage = UIImage(named: "AppIcon") {
        let tempDir = FileManager.default.temporaryDirectory
        let iconURL = tempDir.appendingPathComponent("notification_icon.png")

        if let pngData = appIconImage.pngData() {
          do {
            try pngData.write(to: iconURL)
            return iconURL
          } catch {
            print("⚠️ Could not write icon to temp: \(error)")
          }
        }
      }
      return nil
    }
    return iconURL
  }
}
