import Foundation
import React
import UserNotifications

#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(PreviewActivityModule)
class PreviewActivityModule: NSObject {

  #if canImport(ActivityKit)
  private var currentActivity: Any? = nil
  #endif

  private var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid

  // MARK: - Start Activity

  @objc func startActivity(
    _ projectName: String,
    operationType: String,
    remainingSeconds: Double,
    currentStep: String,
    progress: Double,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      guard ActivityAuthorizationInfo().areActivitiesEnabled else {
        reject("NOT_SUPPORTED", "Live Activities are not enabled", nil)
        return
      }

      let attributes = PreviewActivityAttributes(
        projectName: projectName,
        operationType: operationType
      )

      let state = PreviewActivityAttributes.ContentState(
        remainingSeconds: Int(remainingSeconds),
        currentStep: currentStep,
        progress: progress,
        isCompleted: false,
        completionMessage: nil
      )

      // End all orphaned activities from previous sessions before starting a new one
      Task {
        for orphan in Activity<PreviewActivityAttributes>.activities {
          await orphan.end(nil, dismissalPolicy: .immediate)
        }

        do {
          let activity = try Activity<PreviewActivityAttributes>.request(
            attributes: attributes,
            content: .init(state: state, staleDate: nil),
            pushType: nil
          )
          self.currentActivity = activity
          resolve(activity.id)
        } catch {
          reject("START_ERROR", error.localizedDescription, error)
        }
      }
    } else {
      reject("NOT_SUPPORTED", "Live Activities require iOS 16.2+", nil)
    }
    #else
    reject("NOT_SUPPORTED", "ActivityKit not available", nil)
    #endif
  }

  // MARK: - Update Activity

  @objc func updateActivity(
    _ remainingSeconds: Double,
    currentStep: String,
    progress: Double,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      guard let activity = currentActivity as? Activity<PreviewActivityAttributes> else {
        reject("NO_ACTIVITY", "No active Live Activity", nil)
        return
      }

      let state = PreviewActivityAttributes.ContentState(
        remainingSeconds: Int(remainingSeconds),
        currentStep: currentStep,
        progress: progress,
        isCompleted: false,
        completionMessage: nil
      )

      Task {
        await activity.update(.init(state: state, staleDate: nil))
        resolve(true)
      }
    } else {
      reject("NOT_SUPPORTED", "Live Activities require iOS 16.2+", nil)
    }
    #else
    reject("NOT_SUPPORTED", "ActivityKit not available", nil)
    #endif
  }

  // MARK: - End Activity

  @objc func endActivity(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      guard let activity = currentActivity as? Activity<PreviewActivityAttributes> else {
        resolve(true)
        return
      }

      Task {
        await activity.end(nil, dismissalPolicy: .immediate)
        self.currentActivity = nil
        resolve(true)
      }
    } else {
      resolve(true)
    }
    #else
    resolve(true)
    #endif
  }

  // MARK: - End with Success

  @objc func endActivityWithSuccess(
    _ projectName: String,
    message: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      guard let activity = currentActivity as? Activity<PreviewActivityAttributes> else {
        resolve(true)
        return
      }

      let finalState = PreviewActivityAttributes.ContentState(
        remainingSeconds: 0,
        currentStep: message,
        progress: 1.0,
        isCompleted: true,
        completionMessage: message
      )

      Task {
        await activity.update(.init(state: finalState, staleDate: nil))
        // Keep visible for 1.5s then dismiss
        try? await Task.sleep(nanoseconds: 1_500_000_000)
        await activity.end(
          .init(state: finalState, staleDate: nil),
          dismissalPolicy: .immediate
        )
        self.currentActivity = nil
        resolve(true)
      }
    } else {
      resolve(true)
    }
    #else
    resolve(true)
    #endif
  }

  // MARK: - End All Activities (cleanup orphans on app startup)

  @objc func endAllActivities(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(ActivityKit)
    if #available(iOS 16.2, *) {
      Task {
        for activity in Activity<PreviewActivityAttributes>.activities {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
        self.currentActivity = nil
        resolve(true)
      }
    } else {
      resolve(true)
    }
    #else
    resolve(true)
    #endif
  }

  // MARK: - Background Task

  @objc func beginBackgroundTask(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        reject("INVALID", "Module deallocated", nil)
        return
      }

      // End any existing background task first
      if self.backgroundTaskId != .invalid {
        UIApplication.shared.endBackgroundTask(self.backgroundTaskId)
        self.backgroundTaskId = .invalid
      }

      self.backgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "DrapeCreation") {
        // Expiration handler — iOS is about to suspend us
        UIApplication.shared.endBackgroundTask(self.backgroundTaskId)
        self.backgroundTaskId = .invalid
      }

      resolve(self.backgroundTaskId != .invalid)
    }
  }

  @objc func endBackgroundTask(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else {
        resolve(true)
        return
      }

      if self.backgroundTaskId != .invalid {
        UIApplication.shared.endBackgroundTask(self.backgroundTaskId)
        self.backgroundTaskId = .invalid
      }
      resolve(true)
    }
  }

  // MARK: - Notification Permission

  @objc func requestNotificationPermission(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
      if let error = error {
        reject("PERMISSION_ERROR", error.localizedDescription, error)
      } else {
        resolve(granted)
      }
    }
  }

  // MARK: - Local Notification

  @objc func sendLocalNotification(
    _ title: String,
    body: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default

    let request = UNNotificationRequest(
      identifier: UUID().uuidString,
      content: content,
      trigger: nil // fire immediately
    )

    UNUserNotificationCenter.current().add(request) { error in
      if let error = error {
        reject("NOTIFICATION_ERROR", error.localizedDescription, error)
      } else {
        resolve(true)
      }
    }
  }
}
