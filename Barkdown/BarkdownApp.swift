//
//  BarkdownApp.swift
//  Barkdown
//
//  Created by Joseph Kratz on 10/16/26.
//

import SwiftUI

@main
struct BarkdownApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        DocumentGroup(newDocument: MarkdownDocument()) { file in
            DocumentWindow(document: file.$document, fileURL: file.fileURL)
                .frame(minWidth: 520, minHeight: 360)
        }
        .defaultSize(width: 1100, height: 760)
        .commands { BarkdownCommands() }

        Settings {
            SettingsView()
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
        Preferences.shared.applyAppearance()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        ThemeManager.shared.startObservingAppearance()
    }
}
