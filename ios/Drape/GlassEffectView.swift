import UIKit

@objc(GlassEffectModule)
class GlassEffectModule: NSObject {

  private static var overlays: [String: GlassOverlay] = [:]

  @objc static func requiresMainQueueSetup() -> Bool { return true }

  @objc func applyWithCallback(_ nativeID: String,
                                cornerRadius: CGFloat,
                                resolve: @escaping RCTPromiseResolveBlock,
                                reject: @escaping RCTPromiseRejectBlock) {
    NSLog("[GlassEffect] applyWithCallback: nativeID=%@, cr=%f", nativeID, cornerRadius)

    DispatchQueue.main.async {
      // Always destroy existing overlay — the target view may have changed (tab switch)
      if let existing = Self.overlays[nativeID] {
        existing.destroy()
        Self.overlays.removeValue(forKey: nativeID)
      }

      guard let window = Self.keyWindow() else {
        resolve(["status": "error", "step": "keyWindow"])
        return
      }

      guard let target = Self.findView(nativeID: nativeID, in: window) else {
        resolve(["status": "error", "step": "findView", "nativeID": nativeID])
        return
      }

      #if compiler(>=6.2)
      guard #available(iOS 26.0, *) else {
        resolve(["status": "error", "step": "ios_version", "version": UIDevice.current.systemVersion])
        return
      }
      guard NSClassFromString("UIGlassEffect") != nil else {
        resolve(["status": "error", "step": "class_not_found"])
        return
      }

      let glass = UIGlassEffect(style: .regular)
      glass.isInteractive = true

      let ev = UIVisualEffectView(effect: glass)
      ev.overrideUserInterfaceStyle = .dark
      ev.isUserInteractionEnabled = false
      ev.alpha = 0.45
      ev.layer.cornerRadius = cornerRadius
      ev.layer.cornerCurve = .continuous
      ev.clipsToBounds = true

      // Passthrough container on the WINDOW — outside Fabric tree entirely
      let container = PassthroughView()
      container.backgroundColor = .clear
      let absFrame = target.convert(target.bounds, to: window)
      container.frame = absFrame

      ev.frame = container.bounds
      ev.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      container.addSubview(ev)

      // Add to window ON TOP — PassthroughView ensures all touches go through
      window.addSubview(container)

      let overlay = GlassOverlay(container: container, target: target, window: window)
      Self.overlays[nativeID] = overlay

      NSLog("[GlassEffect] SUCCESS: glass on window with passthrough — frame=%@", NSCoder.string(for: absFrame))
      resolve(["status": "success", "frame": NSCoder.string(for: absFrame)])
      return

      #else
      resolve(["status": "error", "step": "compiler_version"])
      #endif
    }
  }

  @objc func apply(_ nativeID: String, cornerRadius: CGFloat) {
    applyWithCallback(nativeID, cornerRadius: cornerRadius, resolve: { _ in }, reject: { _, _, _ in })
  }

  @objc func remove(_ nativeID: String) {
    DispatchQueue.main.async {
      Self.overlays[nativeID]?.destroy()
      Self.overlays.removeValue(forKey: nativeID)
    }
  }

  @objc func removeAll() {
    DispatchQueue.main.async {
      for (_, overlay) in Self.overlays {
        overlay.destroy()
      }
      Self.overlays.removeAll()
    }
  }

  private static func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
  }

  private static func findView(nativeID: String, in root: UIView) -> UIView? {
    if root.accessibilityIdentifier == nativeID { return root }
    for child in root.subviews {
      if let found = findView(nativeID: nativeID, in: child) { return found }
    }
    return nil
  }
}

// MARK: – PassthroughView — hitTest always returns nil, all touches go to views below

private class PassthroughView: UIView {
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    return nil
  }
}

// MARK: – Overlay tracker

private class GlassOverlay {
  let container: UIView
  weak var target: UIView?
  weak var window: UIWindow?
  private var displayLink: CADisplayLink?

  /// True if the target view is still alive and in a window
  var isValid: Bool {
    return target != nil && target?.window != nil
  }

  init(container: UIView, target: UIView, window: UIWindow) {
    self.container = container
    self.target = target
    self.window = window

    let link = CADisplayLink(target: self, selector: #selector(sync))
    link.preferredFrameRateRange = CAFrameRateRange(minimum: 15, maximum: 60, preferred: 30)
    link.add(to: .main, forMode: .common)
    self.displayLink = link
  }

  @objc private func sync() {
    guard let target = target, let window = window, target.window != nil else {
      container.isHidden = true
      return
    }
    container.isHidden = false
    let absFrame = target.convert(target.bounds, to: window)
    if container.frame != absFrame {
      container.frame = absFrame
    }
  }

  func destroy() {
    displayLink?.invalidate()
    displayLink = nil
    container.removeFromSuperview()
  }

  deinit {
    displayLink?.invalidate()
    container.removeFromSuperview()
  }
}
