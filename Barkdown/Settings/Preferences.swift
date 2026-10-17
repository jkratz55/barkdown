//
//  Preferences.swift
//  Barkdown
//

import AppKit
import Observation

enum AppearanceMode: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var title: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }
}

enum ImageLocation: String, CaseIterable, Identifiable {
    case assetsFolder, documentAssetsFolder, sameFolder, customFolder, keepOriginal
    var id: String { rawValue }
    var title: String {
        switch self {
        case .assetsFolder: "Copy to ./assets"
        case .documentAssetsFolder: "Copy to ./{filename}.assets"
        case .sameFolder: "Copy to the document's folder"
        case .customFolder: "Copy to a custom folder"
        case .keepOriginal: "Don't copy (link to original)"
        }
    }
}

enum PaperSize: String, CaseIterable, Identifiable {
    case a4, letter, legal, a5
    var id: String { rawValue }
    var title: String {
        switch self {
        case .a4: "A4"
        case .letter: "US Letter"
        case .legal: "US Legal"
        case .a5: "A5"
        }
    }
    var size: NSSize {
        switch self {
        case .a4: NSSize(width: 595.28, height: 841.89)
        case .letter: NSSize(width: 612, height: 792)
        case .legal: NSSize(width: 612, height: 1008)
        case .a5: NSSize(width: 419.53, height: 595.28)
        }
    }
}

enum SidebarTab: String, CaseIterable, Identifiable {
    case files, outline, search
    var id: String { rawValue }
}

enum FileViewMode: String {
    case tree, list
}

/// App-wide settings, persisted in UserDefaults.
@Observable
final class Preferences {
    static let shared = Preferences()

    private let defaults = UserDefaults.standard

    // Appearance
    var appearance: AppearanceMode { didSet { save(appearance.rawValue, "appearance"); applyAppearance() } }
    var lightTheme: String { didSet { save(lightTheme, "lightTheme") } }
    var darkTheme: String { didSet { save(darkTheme, "darkTheme") } }
    var fontSize: Double { didSet { save(fontSize, "fontSize") } }
    var lineHeight: Double { didSet { save(lineHeight, "lineHeight") } }
    var contentWidth: Double { didSet { save(contentWidth, "contentWidth") } }
    var fontFamily: String { didSet { save(fontFamily, "fontFamily") } }
    var showStatusBar: Bool { didSet { save(showStatusBar, "showStatusBar") } }

    // Editor
    var focusMode: Bool { didSet { save(focusMode, "focusMode") } }
    var typewriterMode: Bool { didSet { save(typewriterMode, "typewriterMode") } }
    var autoPairBrackets: Bool { didSet { save(autoPairBrackets, "autoPairBrackets") } }
    var autoPairMarkdown: Bool { didSet { save(autoPairMarkdown, "autoPairMarkdown") } }
    var spellcheck: Bool { didSet { save(spellcheck, "spellcheck") } }
    var indentSize: Int { didSet { save(indentSize, "indentSize") } }
    var sourceLineNumbers: Bool { didSet { save(sourceLineNumbers, "sourceLineNumbers") } }
    var convertHTMLPaste: Bool { didSet { save(convertHTMLPaste, "convertHTMLPaste") } }

    // Markdown extensions
    var syntaxMath: Bool { didSet { save(syntaxMath, "syntaxMath") } }
    var syntaxHighlight: Bool { didSet { save(syntaxHighlight, "syntaxHighlight") } }
    var syntaxSupSub: Bool { didSet { save(syntaxSupSub, "syntaxSupSub") } }
    var syntaxDiagrams: Bool { didSet { save(syntaxDiagrams, "syntaxDiagrams") } }
    var syntaxEmoji: Bool { didSet { save(syntaxEmoji, "syntaxEmoji") } }

    // Images
    var imageLocation: ImageLocation { didSet { save(imageLocation.rawValue, "imageLocation") } }
    var customImageFolder: String { didSet { save(customImageFolder, "customImageFolder") } }
    var relativeImagePaths: Bool { didSet { save(relativeImagePaths, "relativeImagePaths") } }

    // Export
    var paperSize: PaperSize { didSet { save(paperSize.rawValue, "paperSize") } }
    var pdfMargin: Double { didSet { save(pdfMargin, "pdfMargin") } }
    var exportTheme: String { didSet { save(exportTheme, "exportTheme") } }

    // Files & windows
    var openFilesInTabs: Bool { didSet { save(openFilesInTabs, "openFilesInTabs") } }
    var showAllFiles: Bool { didSet { save(showAllFiles, "showAllFiles") } }
    var fileViewMode: FileViewMode { didSet { save(fileViewMode.rawValue, "fileViewMode") } }
    var sidebarTab: SidebarTab { didSet { save(sidebarTab.rawValue, "sidebarTab") } }
    var showSidebar: Bool { didSet { save(showSidebar, "showSidebar") } }

    private init() {
        let d = UserDefaults.standard
        func value<T>(_ key: String, _ fallback: T) -> T { d.object(forKey: key) as? T ?? fallback }
        appearance = AppearanceMode(rawValue: value("appearance", "system")) ?? .system
        lightTheme = value("lightTheme", "barkdown")
        darkTheme = value("darkTheme", "barkdown-dark")
        fontSize = value("fontSize", 16.0)
        lineHeight = value("lineHeight", 0.0)
        contentWidth = value("contentWidth", 780.0)
        fontFamily = value("fontFamily", "")
        showStatusBar = value("showStatusBar", true)
        focusMode = value("focusMode", false)
        typewriterMode = value("typewriterMode", false)
        autoPairBrackets = value("autoPairBrackets", true)
        autoPairMarkdown = value("autoPairMarkdown", true)
        spellcheck = value("spellcheck", true)
        indentSize = value("indentSize", 2)
        sourceLineNumbers = value("sourceLineNumbers", false)
        convertHTMLPaste = value("convertHTMLPaste", true)
        syntaxMath = value("syntaxMath", true)
        syntaxHighlight = value("syntaxHighlight", true)
        syntaxSupSub = value("syntaxSupSub", true)
        syntaxDiagrams = value("syntaxDiagrams", true)
        syntaxEmoji = value("syntaxEmoji", true)
        imageLocation = ImageLocation(rawValue: value("imageLocation", "assetsFolder")) ?? .assetsFolder
        customImageFolder = value("customImageFolder", "")
        relativeImagePaths = value("relativeImagePaths", true)
        paperSize = PaperSize(rawValue: value("paperSize", "a4")) ?? .a4
        pdfMargin = value("pdfMargin", 18.0)
        exportTheme = value("exportTheme", "")
        openFilesInTabs = value("openFilesInTabs", true)
        showAllFiles = value("showAllFiles", false)
        fileViewMode = FileViewMode(rawValue: value("fileViewMode", "tree")) ?? .tree
        sidebarTab = SidebarTab(rawValue: value("sidebarTab", "files")) ?? .files
        showSidebar = value("showSidebar", true)
    }

    private func save(_ value: Any, _ key: String) {
        defaults.set(value, forKey: key)
    }

    func applyAppearance() {
        switch appearance {
        case .system: NSApp?.appearance = nil
        case .light: NSApp?.appearance = NSAppearance(named: .aqua)
        case .dark: NSApp?.appearance = NSAppearance(named: .darkAqua)
        }
    }

    func zoom(by delta: Double) {
        fontSize = min(32, max(10, fontSize + delta))
    }

    func resetDefaults() {
        appearance = .system
        lightTheme = "barkdown"
        darkTheme = "barkdown-dark"
        fontSize = 16
        lineHeight = 0
        contentWidth = 780
        fontFamily = ""
        autoPairBrackets = true
        autoPairMarkdown = true
        spellcheck = true
        indentSize = 2
        sourceLineNumbers = false
        convertHTMLPaste = true
    }
}
