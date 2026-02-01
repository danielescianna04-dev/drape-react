import ActivityKit
import WidgetKit
import SwiftUI

@available(iOS 16.1, *)
struct PreviewLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PreviewActivityAttributes.self) { context in
      // Lock Screen UI
      VStack(alignment: .leading, spacing: 8) {
        HStack {
          Image(systemName: context.attributes.iconName)
            .foregroundColor(Color(red: 0.58, green: 0.4, blue: 0.9))
            .font(.system(size: 20))

          Text(context.attributes.projectName)
            .font(.headline)

          Spacer()

          Text("\(context.state.remainingSeconds)s")
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color(red: 0.58, green: 0.4, blue: 0.9))
            .cornerRadius(12)
        }

        VStack(alignment: .leading, spacing: 4) {
          Text(context.state.currentStep)
            .font(.subheadline)
            .foregroundColor(.secondary)

          ProgressView(value: context.state.progress)
            .tint(Color(red: 0.58, green: 0.4, blue: 0.9))
        }
      }
      .padding()
      .activityBackgroundTint(Color.black.opacity(0.8))

    } dynamicIsland: { context in
      DynamicIsland {
        // Expanded UI
        DynamicIslandExpandedRegion(.leading) {
          Text("\(context.state.remainingSeconds)s")
            .font(.system(size: 24, weight: .bold))
            .foregroundColor(.white)
        }

        DynamicIslandExpandedRegion(.trailing) {
          Image(systemName: context.attributes.iconName)
            .foregroundColor(Color(red: 0.58, green: 0.4, blue: 0.9))
            .font(.system(size: 24))
        }

        DynamicIslandExpandedRegion(.center) {
          VStack(spacing: 4) {
            Text(context.attributes.projectName)
              .font(.caption)
              .foregroundColor(.secondary)

            Text(context.state.currentStep)
              .font(.caption2)
              .foregroundColor(.white.opacity(0.7))
          }
        }

        DynamicIslandExpandedRegion(.bottom) {
          ProgressView(value: context.state.progress)
            .tint(Color(red: 0.58, green: 0.4, blue: 0.9))
            .padding(.horizontal)
        }
      } compactLeading: {
        // Compact: Leading (left side)
        Text("\(context.state.remainingSeconds)s")
          .font(.system(size: 12, weight: .semibold))
          .foregroundColor(.white)
      } compactTrailing: {
        // Compact: Trailing (right side)
        Image(systemName: context.attributes.iconName)
          .foregroundColor(Color(red: 0.58, green: 0.4, blue: 0.9))
      } minimal: {
        // Minimal UI (quando ci sono più activities)
        Image(systemName: context.attributes.iconName)
          .foregroundColor(Color(red: 0.58, green: 0.4, blue: 0.9))
      }
    }
  }
}
