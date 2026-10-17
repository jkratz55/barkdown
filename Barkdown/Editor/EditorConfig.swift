//
//  EditorConfig.swift
//  Barkdown
//

import Foundation

/// Everything the web editor needs to know to render, mirrored into JavaScript.
struct EditorConfig: Equatable {
    var theme: String
    var themeCSS: String
    var themeDark: Bool
    var customCSS: String
    var fontSize: Double
    var lineHeight: Double
    var contentWidth: Double
    var fontFamily: String
    var sourceMode: Bool
    var focusMode: Bool
    var typewriter: Bool
    var autoPairBrackets: Bool
    var autoPairMarkdown: Bool
    var spellcheck: Bool
    var lineNumbers: Bool
    var indentSize: Int
    var convertHTMLPaste: Bool
    var baseURL: String?
    var syntax: [String: Bool]

    static func make(sourceMode: Bool, fileURL: URL?, theme: Theme) -> EditorConfig {
        let p = Preferences.shared
        return EditorConfig(
            theme: theme.id,
            themeCSS: theme.css ?? "",
            themeDark: theme.isDark,
            customCSS: ThemeManager.shared.userCSS,
            fontSize: p.fontSize,
            lineHeight: p.lineHeight,
            contentWidth: p.contentWidth,
            fontFamily: p.fontFamily,
            sourceMode: sourceMode,
            focusMode: p.focusMode,
            typewriter: p.typewriterMode,
            autoPairBrackets: p.autoPairBrackets,
            autoPairMarkdown: p.autoPairMarkdown,
            spellcheck: p.spellcheck,
            lineNumbers: p.sourceLineNumbers,
            indentSize: p.indentSize,
            convertHTMLPaste: p.convertHTMLPaste,
            baseURL: fileURL?.deletingLastPathComponent().absoluteString,
            syntax: [
                "math": p.syntaxMath,
                "highlight": p.syntaxHighlight,
                "supsub": p.syntaxSupSub,
                "diagrams": p.syntaxDiagrams,
                "emoji": p.syntaxEmoji,
            ]
        )
    }

    var dictionary: [String: Any] {
        [
            "theme": theme,
            "themeCSS": themeCSS,
            "themeDark": themeDark,
            "customCSS": customCSS,
            "fontSize": fontSize,
            "lineHeight": lineHeight,
            "contentWidth": contentWidth,
            "fontFamily": fontFamily,
            "sourceMode": sourceMode,
            "focusMode": focusMode,
            "typewriter": typewriter,
            "autoPairBrackets": autoPairBrackets,
            "autoPairMarkdown": autoPairMarkdown,
            "spellcheck": spellcheck,
            "lineNumbers": lineNumbers,
            "indentSize": indentSize,
            "convertHTMLPaste": convertHTMLPaste,
            "baseURL": baseURL ?? NSNull(),
            "homeURL": FileManager.default.homeDirectoryForCurrentUser.absoluteString,
            "syntax": syntax,
        ]
    }
}
