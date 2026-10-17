//
//  SettingsView.swift
//  Barkdown
//

import SwiftUI

struct SettingsView: View {
    var body: some View {
        TabView {
            Tab("Appearance", systemImage: "paintpalette") { AppearanceSettings() }
            Tab("Editor", systemImage: "character.cursor.ibeam") { EditorSettings() }
            Tab("Markdown", systemImage: "text.badge.checkmark") { MarkdownSettings() }
            Tab("Images", systemImage: "photo") { ImageSettings() }
            Tab("Export", systemImage: "square.and.arrow.up") { ExportSettings() }
        }
        .frame(width: 580)
        .scenePadding()
    }
}

private struct AppearanceSettings: View {
    @Bindable private var prefs = Preferences.shared
    private var themes = ThemeManager.shared

    var body: some View {
        Form {
            Section {
                Picker("Appearance", selection: $prefs.appearance) {
                    ForEach(AppearanceMode.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
            }
            Section("Light Theme") {
                ThemeGrid(selection: $prefs.lightTheme, themes: themes.allThemes)
            }
            Section("Dark Theme") {
                ThemeGrid(selection: $prefs.darkTheme, themes: themes.allThemes)
            }
            Section {
                HStack {
                    Text("Add your own CSS themes to the theme folder.")
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Open Theme Folder") { themes.openThemesFolder() }
                    Button("Reload") { themes.reload() }
                }
            }
        }
        .formStyle(.grouped)
        .frame(height: 560)
    }
}

private struct ThemeGrid: View {
    @Binding var selection: String
    let themes: [Theme]

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 5), spacing: 10) {
            ForEach(themes) { theme in
                Button {
                    selection = theme.id
                } label: {
                    VStack(spacing: 5) {
                        ThemeSwatch(theme: theme)
                            .overlay(RoundedRectangle(cornerRadius: 7)
                                .strokeBorder(selection == theme.id ? Color.accentColor : Color.primary.opacity(0.12),
                                              lineWidth: selection == theme.id ? 2.5 : 1))
                        Text(theme.name)
                            .font(.system(size: 11))
                            .lineLimit(1)
                            .foregroundStyle(selection == theme.id ? .primary : .secondary)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct ThemeSwatch: View {
    let theme: Theme

    var body: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 7).fill(Color(nsColor: theme.swatch.bg))
            VStack(alignment: .leading, spacing: 4) {
                Text("Aa")
                    .font(.system(size: 14, weight: .bold, design: theme.id == "newsprint" || theme.id == "whitey" || theme.id == "pixyll" ? .serif : .default))
                    .foregroundStyle(Color(nsColor: theme.swatch.fg))
                Capsule().fill(Color(nsColor: theme.swatch.fg).opacity(0.35)).frame(width: 46, height: 3)
                Capsule().fill(Color(nsColor: theme.swatch.fg).opacity(0.25)).frame(width: 34, height: 3)
                Capsule().fill(Color(nsColor: theme.swatch.accent)).frame(width: 22, height: 3)
            }
            .padding(8)
        }
        .frame(height: 64)
    }
}

private struct EditorSettings: View {
    @Bindable private var prefs = Preferences.shared

    private let fonts: [(String, String)] = [
        ("Theme Default", ""),
        ("System", "-apple-system, BlinkMacSystemFont, sans-serif"),
        ("New York", "ui-serif, 'New York', Georgia, serif"),
        ("Charter", "Charter, Georgia, serif"),
        ("Iowan Old Style", "'Iowan Old Style', Georgia, serif"),
        ("Avenir Next", "'Avenir Next', Avenir, sans-serif"),
        ("Helvetica Neue", "'Helvetica Neue', Helvetica, sans-serif"),
        ("SF Mono", "ui-monospace, 'SF Mono', Menlo, monospace"),
    ]

    var body: some View {
        Form {
            Section("Text") {
                Picker("Font", selection: $prefs.fontFamily) {
                    ForEach(fonts, id: \.1) { Text($0.0).tag($0.1) }
                }
                LabeledContent("Font Size") {
                    HStack {
                        Slider(value: $prefs.fontSize, in: 11...28, step: 1)
                        Text("\(Int(prefs.fontSize)) pt").monospacedDigit().frame(width: 44, alignment: .trailing)
                    }
                }
                LabeledContent("Line Height") {
                    HStack {
                        Slider(value: $prefs.lineHeight, in: 0...2.4, step: 0.05)
                        Text(prefs.lineHeight < 1 ? "Theme" : String(format: "%.2f", prefs.lineHeight))
                            .monospacedDigit().frame(width: 44, alignment: .trailing)
                    }
                }
                Picker("Line Width", selection: $prefs.contentWidth) {
                    Text("Narrow").tag(640.0)
                    Text("Medium").tag(780.0)
                    Text("Wide").tag(960.0)
                    Text("Full Width").tag(0.0)
                }
            }
            Section("Typing") {
                Toggle("Auto-pair brackets and quotes", isOn: $prefs.autoPairBrackets)
                Toggle("Auto-pair Markdown symbols (* _ ` ~~ ==)", isOn: $prefs.autoPairMarkdown)
                Toggle("Check spelling while typing", isOn: $prefs.spellcheck)
                Toggle("Convert rich text to Markdown on paste", isOn: $prefs.convertHTMLPaste)
                Picker("Indent Size", selection: $prefs.indentSize) {
                    Text("2 spaces").tag(2)
                    Text("4 spaces").tag(4)
                }
            }
            Section("Source Code Mode") {
                Toggle("Show line numbers", isOn: $prefs.sourceLineNumbers)
            }
            Section("Files") {
                Toggle("Open files from the sidebar in tabs", isOn: $prefs.openFilesInTabs)
                Toggle("Show word count", isOn: $prefs.showStatusBar)
            }
            Section {
                HStack {
                    Spacer()
                    Button("Restore Defaults") { prefs.resetDefaults() }
                }
            }
        }
        .formStyle(.grouped)
        .frame(height: 560)
    }
}

private struct MarkdownSettings: View {
    @Bindable private var prefs = Preferences.shared

    var body: some View {
        Form {
            Section {
                Toggle(isOn: $prefs.syntaxMath) {
                    Text("Math")
                    Text("Inline `$…$` and block `$$…$$` math rendered with KaTeX")
                }
                Toggle(isOn: $prefs.syntaxDiagrams) {
                    Text("Diagrams")
                    Text("Mermaid flowcharts, sequence, Gantt and class diagrams in ```mermaid blocks")
                }
                Toggle(isOn: $prefs.syntaxHighlight) {
                    Text("Highlight")
                    Text("`==highlighted text==`")
                }
                Toggle(isOn: $prefs.syntaxSupSub) {
                    Text("Superscript & Subscript")
                    Text("`x^2^` and `H~2~O`")
                }
                Toggle(isOn: $prefs.syntaxEmoji) {
                    Text("Emoji Shortcodes")
                    Text("`:smile:` with autocomplete")
                }
            } header: {
                Text("Extended Syntax")
            } footer: {
                Text("GitHub Flavored Markdown — tables, task lists, strikethrough, autolinks and footnotes — is always on.")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(height: 420)
    }
}

private struct ImageSettings: View {
    @Bindable private var prefs = Preferences.shared

    var body: some View {
        Form {
            Section {
                Picker("When inserting images", selection: $prefs.imageLocation) {
                    ForEach(ImageLocation.allCases) { Text($0.title).tag($0) }
                }
                if prefs.imageLocation == .customFolder {
                    HStack {
                        TextField("Folder", text: $prefs.customImageFolder, prompt: Text("./images or /path/to/folder"))
                        Button("Choose…") { chooseFolder() }
                    }
                }
                Toggle("Use relative paths when possible", isOn: $prefs.relativeImagePaths)
            } footer: {
                Text("Applies to images you paste, drag in, or insert from a file. Images in unsaved documents are kept in Barkdown's Application Support folder.")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(height: 300)
    }

    private func chooseFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        if panel.runModal() == .OK, let url = panel.url { prefs.customImageFolder = url.path }
    }
}

private struct ExportSettings: View {
    @Bindable private var prefs = Preferences.shared
    private var themes = ThemeManager.shared

    var body: some View {
        Form {
            Section("PDF & Print") {
                Picker("Paper Size", selection: $prefs.paperSize) {
                    ForEach(PaperSize.allCases) { Text($0.title).tag($0) }
                }
                LabeledContent("Margins") {
                    HStack {
                        Slider(value: $prefs.pdfMargin, in: 0...40, step: 1)
                        Text("\(Int(prefs.pdfMargin)) mm").monospacedDigit().frame(width: 50, alignment: .trailing)
                    }
                }
            }
            Section {
                Picker("Theme", selection: $prefs.exportTheme) {
                    Text("Same as Light Theme").tag("")
                    Divider()
                    ForEach(themes.allThemes) { Text($0.name).tag($0.id) }
                }
            } header: {
                Text("HTML, PDF & Image")
            }
            Section("Pandoc") {
                LabeledContent("Status") {
                    if let path = Exporter.pandocPath {
                        Label(path, systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                    } else {
                        Text("Not installed — `brew install pandoc` enables LaTeX, EPUB and more")
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .formStyle(.grouped)
        .frame(height: 400)
    }
}
