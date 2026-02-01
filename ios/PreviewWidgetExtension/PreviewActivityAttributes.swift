import Foundation
import ActivityKit

// Definisce i dati per la Live Activity del preview
struct PreviewActivityAttributes: ActivityAttributes {
  // Contenuto statico (non cambia durante l'activity)
  public struct ContentState: Codable, Hashable {
    var remainingSeconds: Int
    var currentStep: String
    var progress: Double
  }

  // Dati statici
  var projectName: String
  var operationType: String // "preview", "open", "clone", "create"

  /// SF Symbol icon per tipo di operazione
  var iconName: String {
    switch operationType {
    case "open":    return "doc.fill"
    case "clone":   return "arrow.down.circle.fill"
    case "create":  return "plus.circle.fill"
    default:        return "eye.fill" // preview
    }
  }
}
