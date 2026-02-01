import Foundation
import ActivityKit
import UserNotifications
import React

@objc(PreviewActivityModule)
class PreviewActivityModule: NSObject {
  private var currentActivity: Activity<PreviewActivityAttributes>?

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc
  func startActivity(_ projectName: String,
                     operationType: String,
                     remainingSeconds: Int,
                     currentStep: String,
                     progress: Double,
                     resolver: @escaping RCTPromiseResolveBlock,
                     rejecter: @escaping RCTPromiseRejectBlock) {
    if #available(iOS 16.1, *) {
      guard ActivityAuthorizationInfo().areActivitiesEnabled else {
        rejecter("NOT_ENABLED", "Live Activities non sono abilitate dall'utente", nil)
        return
      }

      // Se c'e' gia' un'activity attiva, terminala prima
      if let currentActivity = currentActivity {
        Task {
          await currentActivity.end(nil, dismissalPolicy: .immediate)
        }
      }

      let attributes = PreviewActivityAttributes(projectName: projectName, operationType: operationType)
      let contentState = PreviewActivityAttributes.ContentState(
        remainingSeconds: remainingSeconds,
        currentStep: currentStep,
        progress: progress
      )

      do {
        let activity = try Activity.request(
          attributes: attributes,
          contentState: contentState,
          pushType: nil
        )
        currentActivity = activity
        resolver(activity.id)
      } catch {
        rejecter("START_ERROR", "Errore nell'avviare la Live Activity: \(error.localizedDescription)", error)
      }
    } else {
      rejecter("NOT_SUPPORTED", "Live Activities richiedono iOS 16.1+", nil)
    }
  }

  @objc
  func updateActivity(_ remainingSeconds: Int,
                      currentStep: String,
                      progress: Double,
                      resolver: @escaping RCTPromiseResolveBlock,
                      rejecter: @escaping RCTPromiseRejectBlock) {
    if #available(iOS 16.1, *) {
      guard let activity = currentActivity else {
        rejecter("NO_ACTIVITY", "Nessuna Live Activity attiva da aggiornare", nil)
        return
      }

      let contentState = PreviewActivityAttributes.ContentState(
        remainingSeconds: remainingSeconds,
        currentStep: currentStep,
        progress: progress
      )

      Task {
        await activity.update(using: contentState)
        resolver(true)
      }
    } else {
      rejecter("NOT_SUPPORTED", "Live Activities richiedono iOS 16.1+", nil)
    }
  }

  @objc
  func endActivity(_ resolver: @escaping RCTPromiseResolveBlock,
                   rejecter: @escaping RCTPromiseRejectBlock) {
    if #available(iOS 16.1, *) {
      guard let activity = currentActivity else {
        rejecter("NO_ACTIVITY", "Nessuna Live Activity attiva da terminare", nil)
        return
      }

      Task {
        await activity.end(nil, dismissalPolicy: .immediate)
        currentActivity = nil
        resolver(true)
      }
    } else {
      rejecter("NOT_SUPPORTED", "Live Activities richiedono iOS 16.1+", nil)
    }
  }

  /// Aggiorna la Live Activity con messaggio finale e la termina con dismissal .default
  /// cosi' rimane visibile per qualche secondo nella Dynamic Island
  @objc
  func endActivityWithSuccess(_ projectName: String,
                              message: String,
                              resolver: @escaping RCTPromiseResolveBlock,
                              rejecter: @escaping RCTPromiseRejectBlock) {
    if #available(iOS 16.1, *) {
      guard let activity = currentActivity else {
        resolver(false)
        return
      }

      let finalState = PreviewActivityAttributes.ContentState(
        remainingSeconds: 0,
        currentStep: message,
        progress: 1.0
      )

      Task {
        // Aggiorna con stato finale "Pronto!" al 100%
        await activity.update(using: finalState)

        // Aspetta 1.5s per mostrare lo stato finale nella Dynamic Island
        try? await Task.sleep(nanoseconds: 1_500_000_000)

        // Termina con .default: resta visibile brevemente poi scompare
        await activity.end(using: finalState, dismissalPolicy: .default)
        currentActivity = nil
        resolver(true)
      }
    } else {
      resolver(false)
    }
  }

  /// Richiedi permesso notifiche (chiamato all'avvio dell'app)
  @objc
  func requestNotificationPermission(_ resolver: @escaping RCTPromiseResolveBlock,
                                     rejecter: @escaping RCTPromiseRejectBlock) {
    let center = UNUserNotificationCenter.current()
    center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
      if let error = error {
        rejecter("PERMISSION_ERROR", error.localizedDescription, error)
        return
      }
      resolver(granted)
    }
  }

  /// Invia una notifica push locale (permesso gia' richiesto all'avvio)
  @objc
  func sendLocalNotification(_ title: String,
                             body: String,
                             resolver: @escaping RCTPromiseResolveBlock,
                             rejecter: @escaping RCTPromiseRejectBlock) {
    let center = UNUserNotificationCenter.current()

    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default

    let request = UNNotificationRequest(
      identifier: "preview-ready-\(UUID().uuidString)",
      content: content,
      trigger: nil
    )

    center.add(request) { error in
      if let error = error {
        rejecter("SEND_ERROR", error.localizedDescription, error)
      } else {
        resolver(true)
      }
    }
  }
}
