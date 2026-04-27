# Live Activity / Dynamic Island for Project Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show real-time generation progress in iOS Dynamic Island + Lock Screen Live Activity while user is outside the app, with remote APNs updates so the activity keeps refreshing even after iOS suspends the app.

**Architecture:**
1. **Widget Extension target** (`DrapeDevWidgetExtension`) hosts the SwiftUI UI for Dynamic Island + Lock Screen.
2. **Shared `ActivityAttributes` framework** (compiled into both app + widget via shared Swift file) defines the data contract.
3. **`PreviewActivityModule`** — RN bridge module (Swift + Obj-C `.m`) implements all methods JS already calls (`startActivity`, `updateActivity`, `endActivity`, `endActivityWithSuccess`, `beginBackgroundTask`, `endBackgroundTask`, `endAllActivities`, `requestNotificationPermission`).
4. **Backend APNs Live Activity push** (Phase 2) sends `apns-push-type: liveactivity` updates so Dynamic Island reflects real progress when the JS poller is suspended.

**Tech Stack:**
- Swift 5.9+, ActivityKit (iOS 16.1+), WidgetKit, SwiftUI
- React Native bridge: `RCT_EXPORT_MODULE` + `RCT_EXPORT_METHOD`
- Backend: Node 20 + `apn` npm package (or raw HTTP/2 to APNs) + `.p8` auth key
- Info.plist: `NSSupportsLiveActivities=true` (already set)

**Bundle IDs:**
- App (dev): `com.drape.app.dev`
- Widget Ext (dev): `com.drape.app.dev.LiveActivityWidget`
- App (prod): `com.drape.app`
- Widget Ext (prod): `com.drape.app.LiveActivityWidget`

**Min iOS:** 16.1 (Live Activities) — gated at runtime; older devices get no-op.

**Testing notes:**
- Live Activities work on iOS Simulator iPhone 14 Pro+ and any physical device with Dynamic Island. iPhone 16e (currently booted) has Dynamic Island.
- APNs Live Activity push only works on physical device (sim doesn't receive APNs).

---

## File Structure

**Create (Xcode-managed, native):**
- `ios/Shared/PreviewActivityAttributes.swift` — shared `ActivityAttributes` struct (compiled into both targets)
- `ios/DrapeDev/PreviewActivityModule.swift` — RN bridge implementation
- `ios/DrapeDev/PreviewActivityModule.m` — Obj-C bridge declarations
- `ios/DrapeDevWidgetExtension/DrapeDevWidgetExtension.swift` — `Widget` + Dynamic Island UI
- `ios/DrapeDevWidgetExtension/Info.plist` — widget bundle plist
- `ios/DrapeDevWidgetExtension/DrapeDevWidgetExtension.entitlements` — App Group entitlement

**Modify:**
- `ios/DrapeDev.xcodeproj/project.pbxproj` — add Widget Extension target + shared file membership (done via Xcode UI, plan documents the steps)
- `ios/DrapeDev/DrapeDev.entitlements` — add `com.apple.security.application-groups`
- `ios/DrapeDev/Info.plist` — add background mode `processing` (for activity updates)
- `src/core/services/liveActivityService.ts:1-219` — add `getPushToken(activityId)` method to retrieve APNs token for backend
- `src/core/services/liveActivityService.ts:36` — extend `PreviewActivityState` with optional `taskId` for remote updates
- `App.tsx` — register Live Activity push token with backend on activity start
- `backend-ts/src/services/notification.service.ts` — add `sendLiveActivityUpdate(token, contentState)` method
- `backend-ts/src/routes/workstation.routes.ts:2300-2410` — call `sendLiveActivityUpdate` at each progress step + `endActivity` on completion
- `backend-ts/src/routes/workstation.routes.ts` — new endpoint `POST /workstation/live-activity-token` to receive token from client
- `app.config.ts` — add `expo-build-properties` plugin block for app group + ios deployment target 16.1

**Don't touch:**
- Existing `pushNotificationService.ts` (separate from Live Activity push — uses Expo Push for completion notifications)
- JS callers of `liveActivityService` in `CreateProjectScreen.tsx` (already correctly wired)

---

## Phase 1 — Native module + Widget Extension (MVP, Dynamic Island works while app foreground/30s bg)

### Task 1: Add App Group entitlement to main app

**Files:**
- Modify: `ios/DrapeDev/DrapeDev.entitlements`

- [ ] **Step 1: Edit entitlements file**

Add the App Group key. Final file content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>aps-environment</key>
    <string>development</string>
    <key>com.apple.developer.applesignin</key>
    <array>
      <string>Default</string>
    </array>
    <key>com.apple.security.application-groups</key>
    <array>
      <string>group.com.drape.app.dev.shared</string>
    </array>
  </dict>
</plist>
```

- [ ] **Step 2: Register App Group in Apple Developer portal**

Manual web step:
1. Open https://developer.apple.com/account/resources/identifiers/list/applicationGroup
2. Click `+`, identifier: `group.com.drape.app.dev.shared`, description: `Drape Dev shared`
3. Open the app's App ID `com.drape.app.dev`, enable "App Groups" capability, check the new group, save.
4. Repeat for prod (`group.com.drape.app.shared` + `com.drape.app`).

Expected: both app IDs show "App Groups" enabled in capabilities.

- [ ] **Step 3: Commit**

```bash
git add ios/DrapeDev/DrapeDev.entitlements
git commit -m "feat(ios): add App Group entitlement for live activity sharing"
```

---

### Task 2: Create shared `ActivityAttributes` struct

**Files:**
- Create: `ios/Shared/PreviewActivityAttributes.swift`

- [ ] **Step 1: Create the file**

```swift
// ios/Shared/PreviewActivityAttributes.swift
import ActivityKit
import Foundation

@available(iOS 16.1, *)
public struct PreviewActivityAttributes: ActivityAttributes {
    public typealias ContentState = PreviewContentState

    public struct PreviewContentState: Codable, Hashable {
        public var remainingSeconds: Int
        public var currentStep: String
        public var progress: Double // 0.0 ... 1.0
        public var status: String   // "running" | "completed" | "failed" | "verification_failed"

        public init(remainingSeconds: Int, currentStep: String, progress: Double, status: String) {
            self.remainingSeconds = remainingSeconds
            self.currentStep = currentStep
            self.progress = progress
            self.status = status
        }
    }

    public var projectName: String
    public var operationType: String // "preview" | "open" | "clone" | "create"

    public init(projectName: String, operationType: String) {
        self.projectName = projectName
        self.operationType = operationType
    }
}
```

- [ ] **Step 2: Add file to BOTH targets in Xcode**

Manual Xcode step:
1. Open `ios/DrapeDev.xcworkspace`
2. Right-click project root → "Add Files to DrapeDev"
3. Select `ios/Shared/PreviewActivityAttributes.swift`
4. Check both targets: `DrapeDev` and `DrapeDevWidgetExtension` (the widget target will be created in Task 3 — re-do this after Task 3 if needed).

- [ ] **Step 3: Commit**

```bash
git add ios/Shared/PreviewActivityAttributes.swift
git commit -m "feat(ios): add shared ActivityAttributes for Live Activity"
```

---

### Task 3: Create Widget Extension target

**Files:**
- Create: `ios/DrapeDevWidgetExtension/Info.plist`
- Create: `ios/DrapeDevWidgetExtension/DrapeDevWidgetExtension.entitlements`
- Create: `ios/DrapeDevWidgetExtension/DrapeDevWidgetExtension.swift`
- Modify: `ios/DrapeDev.xcodeproj/project.pbxproj` (via Xcode UI)

- [ ] **Step 1: Create Widget Extension target via Xcode**

Manual:
1. Open `ios/DrapeDev.xcworkspace`
2. File → New → Target → "Widget Extension"
3. Product Name: `DrapeDevWidgetExtension`
4. Bundle ID: `com.drape.app.dev.LiveActivityWidget`
5. Language: Swift, "Include Live Activity" CHECKED
6. Click Finish, "Activate" if prompted
7. Set min iOS deployment target on the new target to 16.1

Verify: target `DrapeDevWidgetExtension` appears in scheme list.

- [ ] **Step 2: Replace generated `DrapeDevWidgetExtension.swift`**

Overwrite Xcode-generated file with:

```swift
// ios/DrapeDevWidgetExtension/DrapeDevWidgetExtension.swift
import ActivityKit
import WidgetKit
import SwiftUI

@available(iOS 16.1, *)
struct DrapeDevWidgetExtension: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: PreviewActivityAttributes.self) { context in
            // Lock Screen / Notification Center
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: iconForType(context.attributes.operationType))
                        .foregroundColor(.purple)
                    Text(context.attributes.projectName)
                        .font(.headline)
                        .lineLimit(1)
                    Spacer()
                    Text("\(Int(context.state.progress * 100))%")
                        .font(.caption.monospacedDigit())
                        .foregroundColor(.secondary)
                }
                Text(context.state.currentStep)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                ProgressView(value: context.state.progress)
                    .progressViewStyle(.linear)
                    .tint(.purple)
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.85))
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: iconForType(context.attributes.operationType))
                        .foregroundColor(.purple)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(Int(context.state.progress * 100))%")
                        .font(.caption.monospacedDigit())
                        .foregroundColor(.secondary)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.projectName)
                        .font(.caption)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(context.state.currentStep)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                        ProgressView(value: context.state.progress)
                            .progressViewStyle(.linear)
                            .tint(.purple)
                    }
                }
            } compactLeading: {
                Image(systemName: iconForType(context.attributes.operationType))
                    .foregroundColor(.purple)
            } compactTrailing: {
                Text("\(Int(context.state.progress * 100))%")
                    .font(.caption2.monospacedDigit())
            } minimal: {
                Image(systemName: iconForType(context.attributes.operationType))
                    .foregroundColor(.purple)
            }
            .keylineTint(.purple)
        }
    }

    private func iconForType(_ type: String) -> String {
        switch type {
        case "create": return "sparkles"
        case "clone":  return "arrow.down.circle"
        case "open":   return "folder"
        default:       return "eye"
        }
    }
}

@main
struct DrapeDevWidgetExtensionBundle: WidgetBundle {
    @WidgetBundleBuilder
    var body: some Widget {
        if #available(iOS 16.1, *) {
            DrapeDevWidgetExtension()
        }
    }
}
```

- [ ] **Step 3: Add App Group entitlement to widget target**

Edit `ios/DrapeDevWidgetExtension/DrapeDevWidgetExtension.entitlements` (Xcode created this file, may need to replace):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.application-groups</key>
    <array>
      <string>group.com.drape.app.dev.shared</string>
    </array>
  </dict>
</plist>
```

- [ ] **Step 4: Add shared `PreviewActivityAttributes.swift` to widget target**

In Xcode: select `ios/Shared/PreviewActivityAttributes.swift` → File Inspector (right pane) → Target Membership → check `DrapeDevWidgetExtension`.

- [ ] **Step 5: Build the widget scheme to verify it compiles**

Run from project root:
```bash
cd ios && xcodebuild -workspace DrapeDev.xcworkspace -scheme DrapeDevWidgetExtension -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 16e' build 2>&1 | tail -20
```

Expected: `** BUILD SUCCEEDED **` at the end. If errors about missing types, re-check Step 4 (target membership of shared file).

- [ ] **Step 6: Commit**

```bash
git add ios/DrapeDevWidgetExtension ios/DrapeDev.xcodeproj
git commit -m "feat(ios): add widget extension with Dynamic Island UI"
```

---

### Task 4: Implement `PreviewActivityModule` Swift bridge

**Files:**
- Create: `ios/DrapeDev/PreviewActivityModule.swift`
- Create: `ios/DrapeDev/PreviewActivityModule.m`
- Modify: `ios/DrapeDev/DrapeDev-Bridging-Header.h` (if not auto-managed)

- [ ] **Step 1: Create the Swift module**

```swift
// ios/DrapeDev/PreviewActivityModule.swift
import Foundation
import ActivityKit
import UIKit
import UserNotifications
import React

@objc(PreviewActivityModule)
class PreviewActivityModule: NSObject {

    private var currentActivity: Any? // Activity<PreviewActivityAttributes> - typed via runtime check
    private var bgTaskId: UIBackgroundTaskIdentifier = .invalid

    @objc static func requiresMainQueueSetup() -> Bool { false }

    // MARK: - Live Activity

    @objc(startActivity:operationType:remainingSeconds:currentStep:progress:resolver:rejecter:)
    func startActivity(
        _ projectName: String,
        operationType: String,
        remainingSeconds: NSNumber,
        currentStep: String,
        progress: NSNumber,
        resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.1, *) else {
            rejecter("UNSUPPORTED", "Live Activities require iOS 16.1+", nil)
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            rejecter("DISABLED", "Live Activities are disabled by user in Settings", nil)
            return
        }
        let attributes = PreviewActivityAttributes(projectName: projectName, operationType: operationType)
        let state = PreviewActivityAttributes.PreviewContentState(
            remainingSeconds: remainingSeconds.intValue,
            currentStep: currentStep,
            progress: progress.doubleValue,
            status: "running"
        )
        do {
            let activity = try Activity<PreviewActivityAttributes>.request(
                attributes: attributes,
                contentState: state,
                pushType: .token
            )
            self.currentActivity = activity
            // Push token for remote APNs updates — emit when available
            Task { [weak self] in
                for await tokenData in activity.pushTokenUpdates {
                    let tokenHex = tokenData.map { String(format: "%02x", $0) }.joined()
                    self?.sendEvent(name: "LiveActivityPushToken", body: ["activityId": activity.id, "token": tokenHex])
                }
            }
            resolver(activity.id)
        } catch {
            rejecter("START_FAILED", error.localizedDescription, error)
        }
    }

    @objc(updateActivity:currentStep:progress:resolver:rejecter:)
    func updateActivity(
        _ remainingSeconds: NSNumber,
        currentStep: String,
        progress: NSNumber,
        resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.1, *),
              let activity = currentActivity as? Activity<PreviewActivityAttributes> else {
            rejecter("NO_ACTIVE", "No active Live Activity", nil); return
        }
        let state = PreviewActivityAttributes.PreviewContentState(
            remainingSeconds: remainingSeconds.intValue,
            currentStep: currentStep,
            progress: progress.doubleValue,
            status: "running"
        )
        Task {
            await activity.update(using: state)
            resolver(true)
        }
    }

    @objc(endActivity:rejecter:)
    func endActivity(
        _ resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.1, *),
              let activity = currentActivity as? Activity<PreviewActivityAttributes> else {
            resolver(true); return
        }
        Task {
            await activity.end(dismissalPolicy: .immediate)
            self.currentActivity = nil
            resolver(true)
        }
    }

    @objc(endActivityWithSuccess:message:resolver:rejecter:)
    func endActivityWithSuccess(
        _ projectName: String,
        message: String,
        resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.1, *),
              let activity = currentActivity as? Activity<PreviewActivityAttributes> else {
            resolver(true); return
        }
        let finalState = PreviewActivityAttributes.PreviewContentState(
            remainingSeconds: 0,
            currentStep: message,
            progress: 1.0,
            status: "completed"
        )
        Task {
            await activity.update(using: finalState)
            // Show success state for ~1.5s before dismissing
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            await activity.end(dismissalPolicy: .after(.now + 2))
            self.currentActivity = nil
            resolver(true)
        }
    }

    @objc(endAllActivities:rejecter:)
    func endAllActivities(
        _ resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.1, *) else { resolver(true); return }
        Task {
            for activity in Activity<PreviewActivityAttributes>.activities {
                await activity.end(dismissalPolicy: .immediate)
            }
            self.currentActivity = nil
            resolver(true)
        }
    }

    // MARK: - Background task

    @objc(beginBackgroundTask:rejecter:)
    func beginBackgroundTask(
        _ resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async {
            self.bgTaskId = UIApplication.shared.beginBackgroundTask(withName: "DrapePreviewPolling") {
                if self.bgTaskId != .invalid {
                    UIApplication.shared.endBackgroundTask(self.bgTaskId)
                    self.bgTaskId = .invalid
                }
            }
            resolver(self.bgTaskId != .invalid)
        }
    }

    @objc(endBackgroundTask:rejecter:)
    func endBackgroundTask(
        _ resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        DispatchQueue.main.async {
            if self.bgTaskId != .invalid {
                UIApplication.shared.endBackgroundTask(self.bgTaskId)
                self.bgTaskId = .invalid
            }
            resolver(true)
        }
    }

    // MARK: - Notification permission

    @objc(requestNotificationPermission:rejecter:)
    func requestNotificationPermission(
        _ resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            resolver(granted)
        }
    }

    // MARK: - Event emitter helper (uses RCTEventEmitter from Obj-C side)

    private func sendEvent(name: String, body: [String: Any]) {
        NotificationCenter.default.post(name: Notification.Name("PreviewActivityEvent"), object: nil, userInfo: ["name": name, "body": body])
    }
}
```

- [ ] **Step 2: Create the Obj-C bridge declarations**

```objc
// ios/DrapeDev/PreviewActivityModule.m
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(PreviewActivityModule, NSObject)

RCT_EXTERN_METHOD(startActivity:(NSString *)projectName
                  operationType:(NSString *)operationType
                  remainingSeconds:(nonnull NSNumber *)remainingSeconds
                  currentStep:(NSString *)currentStep
                  progress:(nonnull NSNumber *)progress
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updateActivity:(nonnull NSNumber *)remainingSeconds
                  currentStep:(NSString *)currentStep
                  progress:(nonnull NSNumber *)progress
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endActivity:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endActivityWithSuccess:(NSString *)projectName
                  message:(NSString *)message
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endAllActivities:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(beginBackgroundTask:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endBackgroundTask:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(requestNotificationPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
```

- [ ] **Step 3: Add both files to `DrapeDev` target in Xcode**

Manual:
1. Right-click `DrapeDev` group → Add Files
2. Select `PreviewActivityModule.swift` and `PreviewActivityModule.m`
3. Target membership: only `DrapeDev` (NOT widget)

- [ ] **Step 4: Build app to verify module compiles + registers**

```bash
cd /Users/leon/Desktop/nexbit/drape/drape-react && npx expo run:ios --device "iPhone 16e" 2>&1 | tail -40
```

Expected: build succeeds, app launches, JS console shows:
```
[LiveActivity] PreviewActivityModule found: true
✅ [LiveActivity] Native module found, isSupported: true
```

- [ ] **Step 5: Commit**

```bash
git add ios/DrapeDev/PreviewActivityModule.swift ios/DrapeDev/PreviewActivityModule.m ios/DrapeDev.xcodeproj
git commit -m "feat(ios): implement PreviewActivityModule RN bridge for Live Activities"
```

---

### Task 5: Manual smoke test — Live Activity appears

**Files:** none (manual QA)

- [ ] **Step 1: Trigger generation while app foregrounded**

Open the app on simulator or device, log in, create a new project from the home screen. Within ~2 seconds of pressing "Create", verify:
- iOS 16.1+ device with Dynamic Island: Dynamic Island shows compact icon + percentage on top.
- iPhone without Dynamic Island (e.g., 13/14 non-Pro): Lock Screen Live Activity appears in notification center when locking.
- Simulator without Dynamic Island: nothing visible (expected — sim limitation).

- [ ] **Step 2: Background app, verify Dynamic Island stays + updates**

While generation is running, swipe up to home screen (don't kill app). Tap Dynamic Island to expand — verify project name + step + progress bar visible.

For ~30s after backgrounding, polling continues and Dynamic Island progress should advance. After 30s, iOS suspends the app: progress freezes at last reported value (this is what Phase 2 fixes).

- [ ] **Step 3: Verify completion ends activity with success animation**

Wait for project to complete. Verify Dynamic Island briefly shows 100% / "Pronto!" then dismisses ~2s later.

- [ ] **Step 4: Verify push notification fires too**

(Already implemented earlier in conversation.) When backgrounded for >30s, when generation finishes, an Expo push notification should also arrive showing "Progetto pronto".

- [ ] **Step 5: No commit (manual QA only)**

If any step fails, debug and patch the relevant Task 3 / Task 4 file before continuing to Phase 2.

---

## Phase 2 — Remote APNs Live Activity push (keep updating after iOS suspends app)

### Task 6: Wire JS service to receive push token + register with backend

**Files:**
- Modify: `src/core/services/liveActivityService.ts`

- [ ] **Step 1: Add push-token listener method**

In `src/core/services/liveActivityService.ts`, add at the top of the class (after the existing imports add `NativeEventEmitter`):

```typescript
import { NativeModules, Platform, NativeEventEmitter } from 'react-native';

const { PreviewActivityModule } = NativeModules;
const previewActivityEvents = PreviewActivityModule
  ? new NativeEventEmitter(PreviewActivityModule)
  : null;
```

Then inside the `LiveActivityService` class, add:

```typescript
private pushTokenListener: { remove: () => void } | null = null;

onPushToken(callback: (info: { activityId: string; token: string }) => void): () => void {
  if (!previewActivityEvents) return () => {};
  const sub = previewActivityEvents.addListener('LiveActivityPushToken', callback);
  this.pushTokenListener = sub;
  return () => sub.remove();
}
```

- [ ] **Step 2: Bridge `NotificationCenter` event in Swift to RCT event**

This requires `PreviewActivityModule` to extend `RCTEventEmitter`. Refactor `PreviewActivityModule.swift`: change `class PreviewActivityModule: NSObject` to `class PreviewActivityModule: RCTEventEmitter`, add:

```swift
override func supportedEvents() -> [String]! { ["LiveActivityPushToken"] }
override static func requiresMainQueueSetup() -> Bool { false }
```

Replace the `sendEvent(name:body:)` private helper with the inherited `sendEvent(withName:body:)`:

```swift
private func emitToken(activityId: String, token: String) {
    sendEvent(withName: "LiveActivityPushToken", body: ["activityId": activityId, "token": token])
}
```

And update the `pushTokenUpdates` `Task` block in `startActivity` to call `self?.emitToken(...)`.

Also update `PreviewActivityModule.m` first line to:

```objc
@interface RCT_EXTERN_MODULE(PreviewActivityModule, RCTEventEmitter)
```

- [ ] **Step 3: In `App.tsx`, register listener that POSTs token to backend**

Add inside `App.tsx`, near other useEffect hooks (after auth user is loaded):

```typescript
import { liveActivityService } from './src/core/services/liveActivityService';
import { config } from './src/core/config/systemConfig';
import { getAuthHeaders } from './src/core/services/authHeaders'; // if exists, otherwise use existing helper

useEffect(() => {
  const unsubscribe = liveActivityService.onPushToken(async ({ activityId, token }) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`${config.apiUrl}/workstation/live-activity-token`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId, token }),
      });
    } catch (err) {
      console.warn('[LiveActivity] failed to register push token', err);
    }
  });
  return unsubscribe;
}, []);
```

- [ ] **Step 4: Build + verify token logged on activity start**

```bash
npx expo run:ios --device "iPhone 16e"
```

Trigger a project creation. JS console should log a POST to `/workstation/live-activity-token`. Backend log should show the token arriving (Task 8 implements the endpoint).

- [ ] **Step 5: Commit**

```bash
git add src/core/services/liveActivityService.ts App.tsx ios/DrapeDev/PreviewActivityModule.swift ios/DrapeDev/PreviewActivityModule.m
git commit -m "feat(live-activity): register APNs push token with backend"
```

---

### Task 7: Backend — accept push token

**Files:**
- Create: `backend-ts/src/services/live-activity-tokens.service.ts`
- Modify: `backend-ts/src/routes/workstation.routes.ts`

- [ ] **Step 1: Create the in-memory token registry**

```typescript
// backend-ts/src/services/live-activity-tokens.service.ts
import { log } from '../utils/logger';

interface ActivityToken {
  userId: string;
  activityId: string;
  token: string; // hex APNs Live Activity push token
  createdAt: number;
  taskId?: string; // associated project creation task
}

class LiveActivityTokenStore {
  private tokens = new Map<string, ActivityToken>(); // key = activityId

  register(userId: string, activityId: string, token: string): void {
    this.tokens.set(activityId, { userId, activityId, token, createdAt: Date.now() });
    log.info(`[LiveActivity] registered token for activity ${activityId} (user ${userId})`);
  }

  associateTask(activityId: string, taskId: string): void {
    const entry = this.tokens.get(activityId);
    if (entry) {
      entry.taskId = taskId;
      this.tokens.set(activityId, entry);
    }
  }

  byTaskId(taskId: string): ActivityToken[] {
    return Array.from(this.tokens.values()).filter(t => t.taskId === taskId);
  }

  remove(activityId: string): void {
    this.tokens.delete(activityId);
  }

  // Cleanup tokens older than 1 hour
  cleanup(): void {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [id, entry] of this.tokens.entries()) {
      if (entry.createdAt < cutoff) this.tokens.delete(id);
    }
  }
}

export const liveActivityTokens = new LiveActivityTokenStore();
setInterval(() => liveActivityTokens.cleanup(), 10 * 60 * 1000);
```

- [ ] **Step 2: Add the endpoint**

In `backend-ts/src/routes/workstation.routes.ts`, near the top with other route handlers, add:

```typescript
import { liveActivityTokens } from '../services/live-activity-tokens.service';

router.post('/live-activity-token', asyncHandler(async (req, res) => {
  const userId = req.userId; // assumes auth middleware sets this
  const { activityId, token, taskId } = req.body;
  if (!activityId || !token) {
    throw new ValidationError('activityId and token are required');
  }
  liveActivityTokens.register(userId, activityId, token);
  if (taskId) liveActivityTokens.associateTask(activityId, taskId);
  res.json({ success: true });
}));
```

- [ ] **Step 3: TS build check**

```bash
cd backend-ts && npx tsc --noEmit 2>&1 | grep -E "live-activity|workstation.routes" | head
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend-ts/src/services/live-activity-tokens.service.ts backend-ts/src/routes/workstation.routes.ts
git commit -m "feat(backend): accept Live Activity APNs push tokens"
```

---

### Task 8: Backend — APNs Live Activity push sender

**Files:**
- Create: `backend-ts/src/services/apns-live-activity.service.ts`
- Modify: `backend-ts/.env` and `/opt/drape-backend-dev/.env` on server (manual)
- Modify: `backend-ts/src/routes/workstation.routes.ts` (call sender at each progress step)

- [ ] **Step 1: Provision APNs auth key**

Manual web steps:
1. Open https://developer.apple.com/account/resources/authkeys/list
2. Click `+`, name "Drape APNs", check "Apple Push Notifications service (APNs)", continue, register.
3. Download the `.p8` file (one-time download — save securely).
4. Note the Key ID (10 chars) and your Team ID (top right of dev portal).
5. Move `.p8` to a safe path on the server: `/opt/drape-backend-dev/secrets/AuthKey_XXXXXXXXXX.p8`.

- [ ] **Step 2: Add env vars (local + server)**

Edit `backend-ts/.env` (local) and `/opt/drape-backend-dev/.env` (via SSH):

```
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=YYYYYYYYYY
APNS_KEY_PATH=/opt/drape-backend-dev/secrets/AuthKey_XXXXXXXXXX.p8
APNS_BUNDLE_ID=com.drape.app.dev
APNS_ENVIRONMENT=development
```

For prod backend, point to the prod key + `com.drape.app` + `production`.

- [ ] **Step 3: Install `apn` package**

```bash
cd backend-ts && npm install apn @types/apn
```

Expected: package installed, lockfile updated.

- [ ] **Step 4: Implement the sender**

```typescript
// backend-ts/src/services/apns-live-activity.service.ts
import apn from 'apn';
import { log } from '../utils/logger';

interface LiveActivityState {
  remainingSeconds: number;
  currentStep: string;
  progress: number; // 0..1
  status: 'running' | 'completed' | 'failed' | 'verification_failed';
}

class ApnsLiveActivityService {
  private provider: apn.Provider | null = null;

  private getProvider(): apn.Provider | null {
    if (this.provider) return this.provider;
    const keyPath = process.env.APNS_KEY_PATH;
    const keyId = process.env.APNS_KEY_ID;
    const teamId = process.env.APNS_TEAM_ID;
    const env = process.env.APNS_ENVIRONMENT === 'production';
    if (!keyPath || !keyId || !teamId) {
      log.warn('[APNs] not configured — skipping');
      return null;
    }
    this.provider = new apn.Provider({
      token: { key: keyPath, keyId, teamId },
      production: env,
    });
    return this.provider;
  }

  async sendUpdate(token: string, state: LiveActivityState): Promise<boolean> {
    const provider = this.getProvider();
    if (!provider) return false;
    const bundleId = process.env.APNS_BUNDLE_ID || 'com.drape.app.dev';

    const note = new apn.Notification();
    note.topic = `${bundleId}.push-type.liveactivity`;
    note.priority = 10;
    note.pushType = 'liveactivity' as any;
    note.expiry = Math.floor(Date.now() / 1000) + 3600;
    note.payload = {
      aps: {
        timestamp: Math.floor(Date.now() / 1000),
        event: state.status === 'running' ? 'update' : 'end',
        'content-state': {
          remainingSeconds: state.remainingSeconds,
          currentStep: state.currentStep,
          progress: state.progress,
          status: state.status,
        },
        'dismissal-date': state.status !== 'running'
          ? Math.floor(Date.now() / 1000) + 3
          : undefined,
      },
    };

    try {
      const result = await provider.send(note, token);
      if (result.failed.length > 0) {
        log.warn(`[APNs] live activity push failed: ${JSON.stringify(result.failed[0].response)}`);
        return false;
      }
      return true;
    } catch (err: any) {
      log.error(`[APNs] send error: ${err?.message || err}`);
      return false;
    }
  }

  shutdown(): void {
    this.provider?.shutdown();
  }
}

export const apnsLiveActivity = new ApnsLiveActivityService();
```

- [ ] **Step 5: Hook sender into the generation pipeline**

In `backend-ts/src/routes/workstation.routes.ts`, find the `update(progress, message, step)` helper used during generation (around line 2300). Patch it (or wrap it) so every call also fires APNs to all tokens for this `taskId` (== `projectId`):

```typescript
import { apnsLiveActivity } from '../services/apns-live-activity.service';
import { liveActivityTokens } from '../services/live-activity-tokens.service';

// inside the createProjectAsync function, near the top, alongside `update`:
const broadcastLiveActivity = (progress: number, currentStep: string, status: 'running' | 'completed' | 'failed' | 'verification_failed') => {
  const tokens = liveActivityTokens.byTaskId(projectId);
  for (const t of tokens) {
    apnsLiveActivity.sendUpdate(t.token, {
      remainingSeconds: Math.max(0, Math.round(120 * (1 - progress / 100))),
      currentStep,
      progress: progress / 100,
      status,
    }).catch(() => {});
  }
};

// patch the existing `update` helper:
const update = (progress: number, message: string, step?: string) => {
  task.progress = progress;
  task.message = message;
  if (step) task.step = step;
  broadcastLiveActivity(progress, step || message, 'running');
};

// at completion:
broadcastLiveActivity(100, 'Project Created Successfully!', 'completed');
// (call once after `task.status = 'completed'`)

// at verification failure:
broadcastLiveActivity(100, 'Verification failed', 'verification_failed');

// at fatal failure (in catch):
broadcastLiveActivity(100, 'Generation failed', 'failed');
```

- [ ] **Step 6: Associate activity with task**

When the client starts an activity it doesn't yet know the projectId. Patch the client → backend POST in Task 6 Step 3 to send the `taskId` once known. Easiest: send a second POST after the project create call returns. In `CreateProjectScreen.tsx`, after `activeTaskIdRef.current = taskId` is set (around line 1130), add:

```typescript
// Re-register all activities of this user with the projectId now that we know it
fetch(`${config.apiUrl}/workstation/live-activity-token`, {
  method: 'POST',
  headers: { ...modeAuthHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify({ activityId: 'all', token: 'rebind', taskId }),
}).catch(() => {});
```

Then in the backend endpoint (Task 7 Step 2), special-case the rebind:

```typescript
if (activityId === 'all' && token === 'rebind' && taskId) {
  // Associate any unattached tokens for this user with this task
  for (const entry of Array.from(liveActivityTokens['tokens'].values())) {
    if (entry.userId === userId && !entry.taskId) {
      liveActivityTokens.associateTask(entry.activityId, taskId);
    }
  }
  res.json({ success: true });
  return;
}
```

(Cleaner architecture: expose `associateAllForUser(userId, taskId)` method instead of accessing the private `tokens` map.)

- [ ] **Step 7: TS build check**

```bash
cd backend-ts && npx tsc --noEmit 2>&1 | grep -E "apns|live-activity|workstation" | head
```

Expected: no errors.

- [ ] **Step 8: Deploy backend dev**

```bash
cd /Users/leon/Desktop/nexbit/drape/drape-react && ./drape dev deploy
```

Expected: `npm run build` succeeds, rsync copies to server, systemd restart succeeds, health check returns 200.

- [ ] **Step 9: Commit**

```bash
git add backend-ts/src/services/apns-live-activity.service.ts backend-ts/src/routes/workstation.routes.ts backend-ts/package.json backend-ts/package-lock.json src/features/projects/CreateProjectScreen.tsx
git commit -m "feat(backend): APNs Live Activity push for real-time updates"
```

---

### Task 9: End-to-end test on physical device

**Files:** none (manual QA — simulator does NOT receive APNs)

- [ ] **Step 1: Build to physical iPhone with Dynamic Island**

```bash
npx expo run:ios --device  # pick your iPhone from the list
```

Confirm app installs and launches.

- [ ] **Step 2: Trigger generation, lock device immediately**

Create a new project. Within 1s, lock the screen. Wait ~60s. Unlock and check Dynamic Island / Lock Screen — progress should have advanced past where iOS suspended the app.

- [ ] **Step 3: Verify final state arrives**

Wait for the full generation. Dynamic Island should reach 100% with "Pronto!" and dismiss after ~3s, even though the app was never reopened.

- [ ] **Step 4: Verify Expo push completion notification still fires**

The Expo push (`Progetto pronto`) implemented earlier should also arrive. Tap it → app opens to the new workstation.

- [ ] **Step 5: Tail backend logs to verify pushes sent**

```bash
./drape logs dev
```

Expected lines like:
```
[APNs] live activity push sent for activity ABC123 (progress 47%)
```

If you see `[APNs] not configured`, the env vars on the server weren't picked up — re-check Task 8 Step 2.

- [ ] **Step 6: Commit (any final tweaks)**

```bash
git add -A
git commit -m "fix(live-activity): final tuning after device test"
```

---

## Self-Review Notes

- **Spec coverage:** Phase 1 = native module + widget + manual QA. Phase 2 = APNs remote push. Together they implement the user's request: Dynamic Island visible during generation + keeps updating in background after iOS suspension.
- **Type consistency:** `PreviewActivityAttributes.PreviewContentState` fields (`remainingSeconds`, `currentStep`, `progress`, `status`) match between Swift, JS service, and APNs payload.
- **Bundle ID assumptions:** Plan uses `com.drape.app.dev` for the dev target. If production rollout is needed, repeat Tasks 1, 3, 8 with prod bundle ID + prod APNs env.
- **Manual steps flagged:** Apple Developer portal capability provisioning, Xcode target creation, `.p8` key download — none of these can be automated; plan calls them out explicitly.
- **Risk:** ActivityKit `pushType: .token` requires the activity to be requested while app is in foreground (iOS limitation). Plan respects this — `startActivity` is only called from `CreateProjectScreen` while user is actively in the app.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-04-27-live-activity-dynamic-island.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Good fit because tasks are independent and each has clear acceptance criteria.

2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Better if you want to see / approve every native edit live.

Which approach?
