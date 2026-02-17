//
//  PreviewWidgetExtensionLiveActivity.swift
//  PreviewWidgetExtension
//
//  Created by Daniele Scianna on 13/02/26.
//

import ActivityKit
import WidgetKit
import SwiftUI

private enum PreviewPalette {
  static let primary = Color(red: 155/255, green: 138/255, blue: 1.0)      // #9B8AFF
  static let tint = Color(red: 190/255, green: 180/255, blue: 1.0)         // #BEB4FF
  static let shade = Color(red: 122/255, green: 106/255, blue: 217/255)    // #7A6AD9
  static let track = Color(red: 122/255, green: 106/255, blue: 217/255).opacity(0.30)
  static let textSecondary = Color.white.opacity(0.72)
  static let lockBackground = Color(red: 22/255, green: 18/255, blue: 36/255).opacity(0.92)
}

struct PreviewWidgetExtensionLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PreviewActivityAttributes.self) { context in
      // LOCK SCREEN / BANNER view
      LockScreenView(context: context)
        .activityBackgroundTint(PreviewPalette.lockBackground)
        .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      DynamicIsland {
        // EXPANDED Dynamic Island
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 8) {
            ZStack {
              Circle()
                .fill(
                  LinearGradient(
                    colors: [PreviewPalette.primary, PreviewPalette.shade],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                  )
                )
                .frame(width: 18, height: 18)
              Image(systemName: iconForOperation(context.attributes.operationType))
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.white)
            }

            Text(context.attributes.projectName)
              .font(.system(size: 13, weight: .semibold, design: .rounded))
              .foregroundColor(.white.opacity(0.98))
              .lineLimit(1)
          }
        }

        DynamicIslandExpandedRegion(.trailing) {
          if context.state.isCompleted {
            ZStack {
              Circle()
                .fill(PreviewPalette.primary.opacity(0.22))
                .frame(width: 22, height: 22)
              Image(systemName: "checkmark")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(PreviewPalette.tint)
            }
          } else {
            VStack(alignment: .trailing, spacing: 1) {
              Text("\(Int(clampedProgress(context.state.progress) * 100))%")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundColor(PreviewPalette.tint)
              Text("\(context.state.remainingSeconds)s")
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundColor(PreviewPalette.textSecondary)
            }
          }
        }

        DynamicIslandExpandedRegion(.bottom) {
          VStack(spacing: 8) {
            // Progress bar
            GeometryReader { geo in
              ZStack(alignment: .leading) {
                Capsule()
                  .fill(PreviewPalette.track)
                  .frame(height: 7)

                Capsule()
                  .fill(
                    LinearGradient(
                      colors: [PreviewPalette.primary, PreviewPalette.tint],
                      startPoint: .leading,
                      endPoint: .trailing
                    )
                  )
                  .frame(width: geo.size.width * clampedProgress(context.state.progress), height: 7)
              }
            }
            .frame(height: 7)

            // Step text
            Text(stepText(context.state.currentStep))
              .font(.system(size: 12, weight: .medium, design: .rounded))
              .foregroundColor(PreviewPalette.textSecondary)
              .lineLimit(1)
          }
          .padding(.horizontal, 2)
          .padding(.bottom, 4)
        }
      } compactLeading: {
        // COMPACT leading (small pill)
        Image(systemName: iconForOperation(context.attributes.operationType))
          .font(.system(size: 12, weight: .semibold))
          .foregroundColor(PreviewPalette.primary)
      } compactTrailing: {
        // COMPACT trailing (small pill)
        if context.state.isCompleted {
          Image(systemName: "checkmark.circle.fill")
            .font(.system(size: 14))
            .foregroundColor(PreviewPalette.tint)
        } else {
          Text("\(Int(context.state.progress * 100))%")
            .font(.system(size: 12, weight: .semibold, design: .monospaced))
            .foregroundColor(PreviewPalette.tint)
        }
      } minimal: {
        // MINIMAL (when other island content takes priority)
        Image(systemName: iconForOperation(context.attributes.operationType))
          .font(.system(size: 12, weight: .semibold))
          .foregroundColor(PreviewPalette.primary)
      }
    }
  }

  private func iconForOperation(_ type: String) -> String {
    switch type {
    case "preview": return "play.fill"
    case "clone": return "square.and.arrow.down.fill"
    case "create": return "plus"
    case "open": return "folder.fill"
    default: return "sparkles"
    }
  }

  private func clampedProgress(_ value: Double) -> CGFloat {
    CGFloat(min(max(value, 0), 1))
  }

  private func stepText(_ raw: String) -> String {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? "Inizializzazione preview..." : trimmed
  }
}

// MARK: - Lock Screen View

struct LockScreenView: View {
  let context: ActivityViewContext<PreviewActivityAttributes>
  private var progress: CGFloat { CGFloat(min(max(context.state.progress, 0), 1)) }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 10) {
        ZStack {
          RoundedRectangle(cornerRadius: 7, style: .continuous)
            .fill(
              LinearGradient(
                colors: [PreviewPalette.primary, PreviewPalette.shade],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
              )
            )
            .frame(width: 24, height: 24)
          Image(systemName: iconForOperation(context.attributes.operationType))
            .font(.system(size: 12, weight: .bold))
            .foregroundColor(.white)
        }

        HStack(spacing: 6) {
          Text(context.attributes.projectName)
            .font(.system(size: 14, weight: .semibold, design: .rounded))
            .foregroundColor(.white.opacity(0.98))
            .lineLimit(1)
        }

        Spacer()

        if context.state.isCompleted {
          HStack(spacing: 4) {
            Image(systemName: "checkmark.circle.fill")
              .font(.system(size: 15, weight: .semibold))
              .foregroundColor(PreviewPalette.tint)
            Text("Done")
              .font(.system(size: 11, weight: .semibold, design: .rounded))
              .foregroundColor(PreviewPalette.tint)
          }
        } else {
          Text("\(Int(progress * 100))%")
            .font(.system(size: 12, weight: .semibold, design: .monospaced))
            .foregroundColor(PreviewPalette.tint)
        }
      }

      Text(stepText(context.state.currentStep))
        .font(.system(size: 12, weight: .medium, design: .rounded))
        .foregroundColor(PreviewPalette.textSecondary)
        .lineLimit(1)

      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule()
            .fill(PreviewPalette.track)
            .frame(height: 8)
          Capsule()
            .fill(
              LinearGradient(
                colors: [PreviewPalette.primary, PreviewPalette.tint],
                startPoint: .leading,
                endPoint: .trailing
              )
            )
            .frame(width: geo.size.width * progress, height: 8)
        }
      }
      .frame(height: 8)

      HStack {
        Text(context.state.isCompleted ? "Preview pronta" : "In esecuzione")
          .font(.system(size: 11, weight: .medium, design: .rounded))
          .foregroundColor(PreviewPalette.textSecondary)
        Spacer()
        if !context.state.isCompleted {
          Text("\(context.state.remainingSeconds)s")
            .font(.system(size: 11, weight: .medium, design: .monospaced))
            .foregroundColor(PreviewPalette.textSecondary)
        }
      }
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .background(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .fill(
          LinearGradient(
            colors: [
              PreviewPalette.lockBackground,
              PreviewPalette.shade.opacity(0.25)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
        )
    )
  }

  private func iconForOperation(_ type: String) -> String {
    switch type {
    case "preview": return "play.fill"
    case "clone": return "square.and.arrow.down.fill"
    case "create": return "plus"
    case "open": return "folder.fill"
    default: return "sparkles"
    }
  }

  private func stepText(_ raw: String) -> String {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? "Inizializzazione preview..." : trimmed
  }
}
