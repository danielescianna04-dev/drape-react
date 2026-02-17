import Foundation

#if canImport(ActivityKit)
import ActivityKit
#endif

#if canImport(ActivityKit)
struct PreviewActivityAttributes: ActivityAttributes {
  /// Fixed data that doesn't change during the activity
  var projectName: String
  var operationType: String // "preview", "open", "clone", "create"

  /// Dynamic data that updates during the activity
  struct ContentState: Codable, Hashable {
    var remainingSeconds: Int
    var currentStep: String
    var progress: Double // 0.0 to 1.0
    var isCompleted: Bool
    var completionMessage: String?
  }
}
#endif
