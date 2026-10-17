//
//  ThemeManager.swift
//  Barkdown
//

import AppKit
import Observation

struct Theme: Identifiable, Hashable {
    let id: String
    let name: String
    let isDark: Bool
    /// Swatch colors for the settings picker: background, text, accent.
    let swatch: (bg: NSColor, fg: NSColor, accent: NSColor)
    /// CSS for user themes loaded from the themes folder; nil for built-ins.
    var css: String?

    var isCustom: Bool { css != nil }

    static func == (a: Theme, b: Theme) -> Bool { a.id == b.id && a.css == b.css }
    func hash(into h: inout Hasher) { h.combine(id) }
}

/// Built-in themes (implemented in the editor bundle) plus user CSS themes from
/// ~/Library/Application Support/Barkdown/Themes, like Typora's theme folder.
@Observable
final class ThemeManager {
    static let shared = ThemeManager()

    static let builtIn: [Theme] = [
        Theme(id: "barkdown", name: "Barkdown", isDark: false, swatch: (.hex(0xFFFFFF), .hex(0x24272D), .hex(0x5B5BD6))),
        Theme(id: "barkdown-dark", name: "Barkdown Dark", isDark: true, swatch: (.hex(0x1C1D21), .hex(0xD9DBE0), .hex(0x8B8CF8))),
        Theme(id: "github", name: "GitHub", isDark: false, swatch: (.hex(0xFFFFFF), .hex(0x1F2328), .hex(0x0969DA))),
        Theme(id: "github-dark", name: "GitHub Dark", isDark: true, swatch: (.hex(0x0D1117), .hex(0xE6EDF3), .hex(0x4493F8))),
        Theme(id: "newsprint", name: "Newsprint", isDark: false, swatch: (.hex(0xF3F2EE), .hex(0x1F0909), .hex(0x065588))),
        Theme(id: "night", name: "Night", isDark: true, swatch: (.hex(0x363B40), .hex(0xB8BFC6), .hex(0xE0E0E0))),
        Theme(id: "pixyll", name: "Pixyll", isDark: false, swatch: (.hex(0xFFFFFF), .hex(0x333333), .hex(0x0076DF))),
        Theme(id: "whitey", name: "Whitey", isDark: false, swatch: (.hex(0xFFFFFF), .hex(0x222222), .hex(0x999999))),
        Theme(id: "solarized", name: "Solarized", isDark: false, swatch: (.hex(0xFDF6E3), .hex(0x586E75), .hex(0x268BD2))),
        Theme(id: "nord", name: "Nord", isDark: true, swatch: (.hex(0x2E3440), .hex(0xD8DEE9), .hex(0x88C0D0))),
    ]

    private(set) var customThemes: [Theme] = []
    /// Contents of `base.user.css`, appended to every theme.
    private(set) var userCSS = ""
    /// Tracks the system/app appearance so the right light or dark theme is chosen.
    private(set) var appIsDark = false
    private var appearanceObservation: NSKeyValueObservation?

    var allThemes: [Theme] { Self.builtIn + customThemes }

    static var themesFolder: URL {
        URL.applicationSupportDirectory.appending(path: "Barkdown/Themes", directoryHint: .isDirectory)
    }

    private init() {
        reload()
    }

    func startObservingAppearance() {
        updateAppearance()
        appearanceObservation = NSApp.observe(\.effectiveAppearance, options: [.new]) { [weak self] _, _ in
            DispatchQueue.main.async { self?.updateAppearance() }
        }
    }

    private func updateAppearance() {
        let dark = NSApp.effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
        if dark != appIsDark { appIsDark = dark }
    }

    func reload() {
        let fm = FileManager.default
        let folder = Self.themesFolder
        try? fm.createDirectory(at: folder, withIntermediateDirectories: true)
        writeReadmeIfNeeded(in: folder)
        let files = (try? fm.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? []
        var themes: [Theme] = []
        var user = ""
        for url in files.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) where url.pathExtension.lowercased() == "css" {
            guard let css = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let base = url.deletingPathExtension().lastPathComponent
            if base == "base.user" {
                user = css
                continue
            }
            let dark = css.range(of: #"--bd-scheme:\s*dark"#, options: .regularExpression) != nil
            let name = base.replacingOccurrences(of: "-", with: " ").replacingOccurrences(of: "_", with: " ").capitalized
            themes.append(Theme(id: "custom:" + base, name: name, isDark: dark,
                                swatch: dark ? (.hex(0x222222), .hex(0xDDDDDD), .hex(0x8888FF)) : (.hex(0xFFFFFF), .hex(0x222222), .hex(0x5555CC)),
                                css: css))
        }
        customThemes = themes
        userCSS = user
    }

    func theme(id: String) -> Theme {
        allThemes.first { $0.id == id } ?? Self.builtIn[0]
    }

    /// The theme for the current appearance.
    var current: Theme {
        let prefs = Preferences.shared
        return theme(id: appIsDark ? prefs.darkTheme : prefs.lightTheme)
    }

    /// Selecting a theme from the Themes menu replaces the theme for the current appearance.
    func select(_ theme: Theme) {
        let prefs = Preferences.shared
        if appIsDark { prefs.darkTheme = theme.id } else { prefs.lightTheme = theme.id }
    }

    func openThemesFolder() {
        NSWorkspace.shared.open(Self.themesFolder)
    }

    private func writeReadmeIfNeeded(in folder: URL) {
        let readme = folder.appending(path: "README.md")
        guard !FileManager.default.fileExists(atPath: readme.path) else { return }
        let text = """
        # Barkdown Themes

        Drop `.css` files in this folder and choose **Themes → Reload Themes**.
        Each file becomes a theme named after the file.

        Themes are built on CSS variables. Start by overriding a few of them:

        ```css
        :root {
          --bd-bg: #fbfaf7;
          --bd-fg: #2b2b2b;
          --bd-accent: #c2410c;
          --bd-font-body: "Iowan Old Style", Georgia, serif;
          --bd-heading-weight: 700;
        }
        ```

        Add `--bd-scheme: dark;` to mark a theme as dark. A file named `base.user.css`
        is applied on top of every theme.

        Useful variables: `--bd-bg`, `--bd-fg`, `--bd-muted`, `--bd-faint`, `--bd-accent`,
        `--bd-link`, `--bd-selection`, `--bd-border`, `--bd-code-bg`, `--bd-code-fg`,
        `--bd-inline-code-bg`, `--bd-inline-code-fg`, `--bd-quote-border`, `--bd-quote-fg`,
        `--bd-mark-bg`, `--bd-table-border`, `--bd-table-header-bg`, `--bd-font-body`,
        `--bd-font-heading`, `--bd-font-mono`, `--bd-line-height`, `--bd-h1-size` … `--bd-h6-size`,
        and `--tok-keyword`, `--tok-string`, `--tok-comment`, `--tok-number`, `--tok-function`
        for code highlighting.
        """
        try? text.write(to: readme, atomically: true, encoding: .utf8)
    }
}

extension NSColor {
    static func hex(_ value: UInt32) -> NSColor {
        NSColor(srgbRed: CGFloat((value >> 16) & 0xFF) / 255,
                green: CGFloat((value >> 8) & 0xFF) / 255,
                blue: CGFloat(value & 0xFF) / 255,
                alpha: 1)
    }
}
