//
//  PreviewWidgetExtensionLiveActivity.swift
//  PreviewWidgetExtension
//
//  Created by Daniele Scianna on 03/02/26.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct PreviewWidgetExtensionLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PreviewActivityAttributes.self) { context in
            // Lock screen/banner UI
            LockScreenLiveActivityView(context: context)
                .activityBackgroundTint(Color(red: 0.05, green: 0.03, blue: 0.09))
                .activitySystemActionForegroundColor(.white)

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI (long press)
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        // Purple eye icon
                        Image(systemName: "eye.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color(red: 0.6, green: 0.3, blue: 1.0))

                        VStack(alignment: .leading, spacing: 2) {
                            Text(context.state.projectName)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(.white)
                            Text(context.state.currentStep)
                                .font(.system(size: 11))
                                .foregroundColor(.white.opacity(0.7))
                        }
                    }
                }

                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 4) {
                        Text("\(context.state.remainingSeconds)s")
                            .font(.system(size: 16, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)

                        Text(operationLabel(context.state.operationType))
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(Color(red: 0.6, green: 0.3, blue: 1.0))
                    }
                }

                DynamicIslandExpandedRegion(.bottom) {
                    // Progress bar
                    GeometryReader { geometry in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.white.opacity(0.2))
                                .frame(height: 6)

                            RoundedRectangle(cornerRadius: 4)
                                .fill(
                                    LinearGradient(
                                        colors: [
                                            Color(red: 0.6, green: 0.3, blue: 1.0),
                                            Color(red: 0.8, green: 0.4, blue: 1.0)
                                        ],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .frame(width: geometry.size.width * CGFloat(context.state.progress), height: 6)
                        }
                    }
                    .frame(height: 6)
                    .padding(.top, 8)
                }
            } compactLeading: {
                // Compact leading (left pill)
                HStack(spacing: 4) {
                    Image(systemName: "eye.fill")
                        .font(.system(size: 12))
                        .foregroundColor(Color(red: 0.6, green: 0.3, blue: 1.0))
                }
            } compactTrailing: {
                // Compact trailing (right pill)
                Text("\(context.state.remainingSeconds)s")
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundColor(.white)
            } minimal: {
                // Minimal (when another activity is also running)
                Image(systemName: "eye.fill")
                    .font(.system(size: 12))
                    .foregroundColor(Color(red: 0.6, green: 0.3, blue: 1.0))
            }
        }
    }

    private func operationLabel(_ type: String) -> String {
        switch type {
        case "preview": return "PREVIEW"
        case "clone": return "CLONE"
        case "create": return "CREATE"
        case "open": return "OPEN"
        case "complete": return "DONE"
        default: return "LOADING"
        }
    }
}

// MARK: - Lock Screen View

struct LockScreenLiveActivityView: View {
    let context: ActivityViewContext<PreviewActivityAttributes>

    var body: some View {
        HStack(spacing: 12) {
            // Purple eye icon
            ZStack {
                Circle()
                    .fill(Color(red: 0.6, green: 0.3, blue: 1.0).opacity(0.2))
                    .frame(width: 44, height: 44)

                Image(systemName: "eye.fill")
                    .font(.system(size: 20))
                    .foregroundColor(Color(red: 0.6, green: 0.3, blue: 1.0))
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(context.state.projectName)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)

                Text(context.state.currentStep)
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.7))

                // Progress bar
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.white.opacity(0.2))
                            .frame(height: 4)

                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color(red: 0.6, green: 0.3, blue: 1.0))
                            .frame(width: geometry.size.width * CGFloat(context.state.progress), height: 4)
                    }
                }
                .frame(height: 4)
            }

            Spacer()

            // Time remaining
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(context.state.remainingSeconds)s")
                    .font(.system(size: 18, weight: .bold, design: .monospaced))
                    .foregroundColor(.white)

                Text(operationLabel(context.state.operationType))
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Color(red: 0.6, green: 0.3, blue: 1.0))
            }
        }
        .padding(16)
    }

    private func operationLabel(_ type: String) -> String {
        switch type {
        case "preview": return "PREVIEW"
        case "clone": return "CLONE"
        case "create": return "CREATE"
        case "open": return "OPEN"
        case "complete": return "DONE"
        default: return "LOADING"
        }
    }
}

// MARK: - Previews

extension PreviewActivityAttributes {
    fileprivate static var preview: PreviewActivityAttributes {
        PreviewActivityAttributes(projectName: "my-app", operationType: "clone")
    }
}

extension PreviewActivityAttributes.ContentState {
    fileprivate static var loading: PreviewActivityAttributes.ContentState {
        PreviewActivityAttributes.ContentState(
            remainingSeconds: 45,
            currentStep: "Cloning repository...",
            progress: 0.3,
            projectName: "my-app",
            operationType: "clone"
        )
    }

    fileprivate static var complete: PreviewActivityAttributes.ContentState {
        PreviewActivityAttributes.ContentState(
            remainingSeconds: 0,
            currentStep: "Done!",
            progress: 1.0,
            projectName: "my-app",
            operationType: "complete"
        )
    }
}

#Preview("Notification", as: .content, using: PreviewActivityAttributes.preview) {
    PreviewWidgetExtensionLiveActivity()
} contentStates: {
    PreviewActivityAttributes.ContentState.loading
    PreviewActivityAttributes.ContentState.complete
}
