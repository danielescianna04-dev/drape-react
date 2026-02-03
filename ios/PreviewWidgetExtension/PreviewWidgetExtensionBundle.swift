//
//  PreviewWidgetExtensionBundle.swift
//  PreviewWidgetExtension
//
//  Created by Daniele Scianna on 03/02/26.
//

import WidgetKit
import SwiftUI

@main
struct PreviewWidgetExtensionBundle: WidgetBundle {
    var body: some Widget {
        // Only include Live Activity for Dynamic Island
        PreviewWidgetExtensionLiveActivity()
    }
}
