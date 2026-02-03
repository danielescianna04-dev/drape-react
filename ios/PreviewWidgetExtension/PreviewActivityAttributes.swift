import Foundation
import ActivityKit

/// Shared attributes for Preview Live Activity
/// This must be identical in both the main app and widget extension
public struct PreviewActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var remainingSeconds: Int
    public var currentStep: String
    public var progress: Double
    public var projectName: String
    public var operationType: String

    public init(remainingSeconds: Int, currentStep: String, progress: Double, projectName: String, operationType: String) {
      self.remainingSeconds = remainingSeconds
      self.currentStep = currentStep
      self.progress = progress
      self.projectName = projectName
      self.operationType = operationType
    }
  }

  public var projectName: String
  public var operationType: String

  public init(projectName: String, operationType: String) {
    self.projectName = projectName
    self.operationType = operationType
  }
}
