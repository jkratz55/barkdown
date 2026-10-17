//
//  BarkdownCommands.swift
//  Barkdown
//

import SwiftUI

extension FocusedValues {
    @Entry var editor: EditorController?
}

private func functionKey(_ code: Int) -> KeyEquivalent {
    KeyEquivalent(Character(UnicodeScalar(code)!))
}

struct BarkdownCommands: Commands {
    @FocusedValue(\.editor) private var editor
    private var prefs = Preferences.shared
    private var themes = ThemeManager.shared

    private var noEditor: Bool { editor == nil }

    private func run(_ command: String, _ arg: Any? = nil) -> () -> Void {
        { editor?.run(command, arg) }
    }

    var body: some Commands {
        // MARK: File
        CommandGroup(after: .newItem) {
            Button("Open Folder…") { Workspace.shared.chooseFolder(in: editor?.window ?? NSApp.keyWindow) }
            Button("Quick Open…") { editor?.showQuickOpen = true }
                .keyboardShortcut("o", modifiers: [.command, .shift])
                .disabled(noEditor)
        }

        CommandGroup(after: .saveItem) {
            Divider()
            Button("Import…") { if let editor { Exporter.importDocument(editor: editor) } }
                .disabled(noEditor)
            Menu("Export") {
                if let editor { ExportMenuItems(editor: editor) }
            }
            .disabled(noEditor)
            Divider()
            Button("Reveal in Finder") {
                if let url = editor?.fileURL { NSWorkspace.shared.activateFileViewerSelecting([url]) }
            }
            .disabled(editor?.fileURL == nil)
        }

        CommandGroup(replacing: .printItem) {
            Button("Print…") { if let editor { Exporter.print(editor: editor) } }
                .keyboardShortcut("p")
                .disabled(noEditor)
        }

        // MARK: Edit
        CommandGroup(replacing: .undoRedo) {
            Button("Undo") {
                if let editor { editor.undo() } else { NSApp.sendAction(Selector(("undo:")), to: nil, from: nil) }
            }
            .keyboardShortcut("z")
            Button("Redo") {
                if let editor { editor.redo() } else { NSApp.sendAction(Selector(("redo:")), to: nil, from: nil) }
            }
            .keyboardShortcut("z", modifiers: [.command, .shift])
        }

        CommandGroup(after: .pasteboard) {
            Divider()
            Button("Copy as Markdown") { editor?.copyAsMarkdown() }
                .keyboardShortcut("c", modifiers: [.command, .shift])
                .disabled(noEditor)
            Button("Copy as HTML") { editor?.copyAsHTML() }
                .disabled(noEditor)
            Button("Paste as Plain Text") { editor?.pasteAsPlainText() }
                .keyboardShortcut("v", modifiers: [.command, .shift])
                .disabled(noEditor)
            Divider()
            Menu("Selection") {
                Button("Select Line / Sentence", action: run("selectLine")).keyboardShortcut("l")
                Button("Select Styled Scope", action: run("selectBlock")).keyboardShortcut("e", modifiers: [.command, .control])
                Divider()
                Button("Jump to Top", action: run("jumpTop"))
                Button("Jump to Bottom", action: run("jumpBottom"))
            }
            .disabled(noEditor)
        }

        CommandGroup(replacing: .textEditing) {
            Menu("Find") {
                Button("Find…", action: run("find")).keyboardShortcut("f")
                Button("Find and Replace…", action: run("replace")).keyboardShortcut("f", modifiers: [.command, .option])
                Button("Find Next", action: run("findNext")).keyboardShortcut("g")
                Button("Find Previous", action: run("findPrevious")).keyboardShortcut("g", modifiers: [.command, .shift])
                Button("Use Selection for Find", action: run("useSelectionForFind")).keyboardShortcut("e")
                Divider()
                Button("Search in Folder…") {
                    editor?.sidebarVisible = true
                    editor?.sidebarTab = .search
                }
                .keyboardShortcut("f", modifiers: [.command, .shift])
            }
            .disabled(noEditor)
        }

        // MARK: Paragraph
        CommandMenu("Paragraph") {
            ForEach(1...6, id: \.self) { level in
                Button("Heading \(level)", action: run("heading", level))
                    .keyboardShortcut(KeyEquivalent(Character("\(level)")))
            }
            Button("Paragraph", action: run("paragraph")).keyboardShortcut("0")
            Divider()
            Button("Increase Heading Level", action: run("increaseHeading")).keyboardShortcut("=")
            Button("Decrease Heading Level", action: run("decreaseHeading")).keyboardShortcut("-")
            Divider()
            Button("Table…") { editor?.showInsertTable = true }.keyboardShortcut("t", modifiers: [.command, .option])
            Button("Code Fences", action: run("codeFence")).keyboardShortcut("c", modifiers: [.command, .option])
            Button("Math Block", action: run("mathBlock")).keyboardShortcut("b", modifiers: [.command, .option])
            Button("Diagram (Mermaid)", action: run("codeFence", "mermaid"))
            Divider()
            Button("Quote", action: run("quote")).keyboardShortcut("q", modifiers: [.command, .option])
            Button("Ordered List", action: run("orderedList")).keyboardShortcut("o", modifiers: [.command, .option])
            Button("Unordered List", action: run("unorderedList")).keyboardShortcut("u", modifiers: [.command, .option])
            Button("Task List", action: run("taskList")).keyboardShortcut("x", modifiers: [.command, .option])
            Divider()
            Button("Insert Paragraph Above", action: run("paragraphAbove"))
            Button("Insert Paragraph Below", action: run("paragraphBelow"))
            Divider()
            Button("Link Reference", action: run("linkReference")).keyboardShortcut("l", modifiers: [.command, .option])
            Button("Footnote", action: run("footnote")).keyboardShortcut("r", modifiers: [.command, .option])
            Divider()
            Button("Horizontal Line", action: run("horizontalRule")).keyboardShortcut("-", modifiers: [.command, .option])
            Button("Table of Contents", action: run("toc"))
            Button("YAML Front Matter", action: run("frontMatter"))
        }

        // MARK: Format
        CommandMenu("Format") {
            Button("Strong", action: run("strong")).keyboardShortcut("b")
            Button("Emphasis", action: run("emphasis")).keyboardShortcut("i")
            Button("Underline", action: run("underline")).keyboardShortcut("u")
            Button("Code", action: run("code")).keyboardShortcut("`", modifiers: [.control])
            Button("Strikethrough", action: run("strike")).keyboardShortcut("`", modifiers: [.control, .shift])
            Button("Highlight", action: run("highlight")).keyboardShortcut("h", modifiers: [.command, .shift])
            Button("Superscript", action: run("superscript"))
            Button("Subscript", action: run("subscript"))
            Button("Inline Math", action: run("inlineMath")).keyboardShortcut("m", modifiers: [.control])
            Button("Comment", action: run("comment"))
            Divider()
            Button("Hyperlink") { editor?.insertHyperlink() }.keyboardShortcut("k")
            Menu("Image") {
                Button("Insert Image", action: run("image")).keyboardShortcut("i", modifiers: [.command, .control])
                Button("Insert Image from File…") { editor?.insertImageFromFile() }
            }
            Divider()
            Button("Clear Format", action: run("clearFormat")).keyboardShortcut("\\")
        }

        // MARK: View
        CommandGroup(before: .sidebar) {
            Toggle("Source Code Mode", isOn: Binding(get: { editor?.sourceMode ?? false }, set: { editor?.sourceMode = $0 }))
                .keyboardShortcut("/")
                .disabled(noEditor)
            Divider()
            Button((editor?.sidebarVisible ?? false) ? "Hide Sidebar" : "Show Sidebar") { editor?.sidebarVisible.toggle() }
                .keyboardShortcut("l", modifiers: [.command, .shift])
                .disabled(noEditor)
            Button("Outline") { show(.outline) }.keyboardShortcut("1", modifiers: [.command, .shift]).disabled(noEditor)
            Button("File List") { show(.files, mode: .list) }.keyboardShortcut("2", modifiers: [.command, .shift]).disabled(noEditor)
            Button("File Tree") { show(.files, mode: .tree) }.keyboardShortcut("3", modifiers: [.command, .shift]).disabled(noEditor)
            Divider()
            Toggle("Focus Mode", isOn: Binding(get: { prefs.focusMode }, set: { prefs.focusMode = $0 }))
                .keyboardShortcut(functionKey(NSF8FunctionKey), modifiers: [])
            Toggle("Typewriter Mode", isOn: Binding(get: { prefs.typewriterMode }, set: { prefs.typewriterMode = $0 }))
                .keyboardShortcut(functionKey(NSF9FunctionKey), modifiers: [])
            Toggle("Show Word Count", isOn: Binding(get: { prefs.showStatusBar }, set: { prefs.showStatusBar = $0 }))
            Divider()
            Button("Actual Size") { prefs.fontSize = 16 }.keyboardShortcut("0", modifiers: [.command, .shift])
            Button("Zoom In") { prefs.zoom(by: 1) }.keyboardShortcut("=", modifiers: [.command, .shift])
            Button("Zoom Out") { prefs.zoom(by: -1) }.keyboardShortcut("-", modifiers: [.command, .shift])
            Divider()
        }

        CommandGroup(replacing: .toolbar) {}

        // MARK: Themes
        CommandMenu("Themes") {
            Picker("Theme", selection: Binding(get: { themes.current.id }, set: { id in themes.select(themes.theme(id: id)) })) {
                ForEach(ThemeManager.builtIn) { theme in
                    Text(theme.name).tag(theme.id)
                }
                if !themes.customThemes.isEmpty {
                    Divider()
                    ForEach(themes.customThemes) { theme in
                        Text(theme.name).tag(theme.id)
                    }
                }
            }
            .pickerStyle(.inline)
            .labelsHidden()
            Divider()
            Picker("Appearance", selection: Binding(get: { prefs.appearance }, set: { prefs.appearance = $0 })) {
                ForEach(AppearanceMode.allCases) { mode in Text(mode.title).tag(mode) }
            }
            Divider()
            Button("Open Theme Folder") { themes.openThemesFolder() }
            Button("Reload Themes") { themes.reload() }
        }

        // MARK: Window & Help
        CommandGroup(after: .windowArrangement) {
            Toggle("Always on Top", isOn: Binding(get: { editor?.isFloating ?? false }, set: { editor?.isFloating = $0 }))
                .disabled(noEditor)
        }

        CommandGroup(replacing: .help) {
            Button("Barkdown Guide") { openGuide() }
            Button("Markdown Reference") { openGuide() }
        }
    }

    private func show(_ tab: SidebarTab, mode: FileViewMode? = nil) {
        guard let editor else { return }
        if editor.sidebarVisible && editor.sidebarTab == tab && (mode == nil || prefs.fileViewMode == mode) {
            editor.sidebarVisible = false
            return
        }
        if let mode { prefs.fileViewMode = mode }
        editor.sidebarTab = tab
        editor.sidebarVisible = true
    }

    private func openGuide() {
        guard let url = Bundle.main.url(forResource: "Barkdown Guide", withExtension: "md"),
              let text = try? String(contentsOf: url, encoding: .utf8) else { return }
        if let editor, let open = editor.openNewDocument {
            open(text)
        } else {
            NSDocumentController.shared.newDocument(nil)
        }
    }
}
