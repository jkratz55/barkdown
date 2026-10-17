//
//  DocumentWindow.swift
//  Barkdown
//

import SwiftUI

struct DocumentWindow: View {
    @Binding var document: MarkdownDocument
    let fileURL: URL?

    @State private var editor = EditorController()
    @Environment(\.openDocument) private var openDocument
    @Environment(\.newDocument) private var newDocument
    private var prefs = Preferences.shared
    private var themes = ThemeManager.shared

    init(document: Binding<MarkdownDocument>, fileURL: URL?) {
        _document = document
        self.fileURL = fileURL
    }

    private var theme: Theme { themes.current }

    private var config: EditorConfig {
        EditorConfig.make(sourceMode: editor.sourceMode, fileURL: fileURL, theme: theme)
    }

    var body: some View {
        NavigationSplitView(columnVisibility: sidebarVisibility) {
            SidebarView(editor: editor, fileURL: fileURL)
                .navigationSplitViewColumnWidth(min: 200, ideal: 260, max: 420)
        } detail: {
            EditorWebView(text: $document.text, controller: editor, config: config)
                .background(Color(nsColor: theme.swatch.bg))
                .overlay(alignment: .bottomTrailing) {
                    if prefs.showStatusBar {
                        StatusPill(editor: editor)
                            .padding(14)
                    }
                }
                .ignoresSafeArea(.container, edges: .bottom)
                .navigationTitle(fileURL?.deletingPathExtension().lastPathComponent ?? "Untitled")
                .toolbar { EditorToolbar(editor: editor) }
        }
        .focusedSceneValue(\.editor, editor)
        .preferredColorScheme(theme.isDark ? .dark : .light)
        .sheet(isPresented: $editor.showQuickOpen) {
            QuickOpenView(editor: editor, fileURL: fileURL)
        }
        .sheet(isPresented: $editor.showInsertTable) {
            InsertTableSheet { rows, cols in
                editor.run("table", ["rows": rows, "cols": cols])
            }
        }
        .background(WindowAccessor { window in
            configure(window)
        })
        .onAppear {
            editor.fileURL = fileURL
            editor.openNewDocument = { text in newDocument(MarkdownDocument(text: text)) }
            editor.openFile = { url in open(url) }
            if let url = fileURL, let find = Workspace.shared.pendingFinds.removeValue(forKey: url) {
                editor.find(find)
            }
        }
        .onChange(of: fileURL) { _, url in editor.fileURL = url }
        .onChange(of: editor.sidebarTab) { _, tab in prefs.sidebarTab = tab }
    }

    private var sidebarVisibility: Binding<NavigationSplitViewVisibility> {
        Binding(
            get: { editor.sidebarVisible ? .all : .detailOnly },
            set: { value in
                editor.sidebarVisible = value != .detailOnly
                prefs.showSidebar = editor.sidebarVisible
            }
        )
    }

    private func configure(_ window: NSWindow) {
        guard editor.window !== window else { return }
        editor.window = window
        window.tabbingIdentifier = "BarkdownDocument"
        window.titlebarSeparatorStyle = .none
        if let parent = Workspace.shared.tabParent, parent !== window, parent.isVisible {
            Workspace.shared.tabParent = nil
            parent.addTabbedWindow(window, ordered: .above)
            window.makeKeyAndOrderFront(nil)
        }
    }

    private func open(_ url: URL) {
        if prefs.openFilesInTabs { Workspace.shared.tabParent = editor.window }
        Task {
            do {
                try await openDocument(at: url)
            } catch {
                Workspace.shared.tabParent = nil
                NSAlert(error: error).runModal()
            }
        }
    }
}

/// Gives SwiftUI views access to their hosting NSWindow.
struct WindowAccessor: NSViewRepresentable {
    let onWindow: (NSWindow) -> Void

    func makeNSView(context: Context) -> NSView {
        let view = AccessorView()
        view.onWindow = onWindow
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        (nsView as? AccessorView)?.onWindow = onWindow
        if let window = nsView.window { onWindow(window) }
    }

    final class AccessorView: NSView {
        var onWindow: ((NSWindow) -> Void)?
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if let window { onWindow?(window) }
        }
    }
}

struct EditorToolbar: ToolbarContent {
    let editor: EditorController
    private var prefs = Preferences.shared
    private var themes = ThemeManager.shared

    init(editor: EditorController) {
        self.editor = editor
    }

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            Button {
                editor.sourceMode.toggle()
            } label: {
                Label(editor.sourceMode ? "Live Preview" : "Source Code",
                      systemImage: editor.sourceMode ? "eye" : "chevron.left.forwardslash.chevron.right")
            }
            .help(editor.sourceMode ? "Switch to Live Preview (⌘/)" : "Switch to Source Code Mode (⌘/)")

            Menu {
                Toggle("Focus Mode", isOn: Binding(get: { prefs.focusMode }, set: { prefs.focusMode = $0 }))
                Toggle("Typewriter Mode", isOn: Binding(get: { prefs.typewriterMode }, set: { prefs.typewriterMode = $0 }))
                Divider()
                Picker("Theme", selection: Binding(get: { themes.current.id }, set: { id in themes.select(themes.theme(id: id)) })) {
                    ForEach(themes.allThemes) { theme in
                        Text(theme.name).tag(theme.id)
                    }
                }
                .pickerStyle(.inline)
            } label: {
                Label("Appearance", systemImage: "textformat")
            }
            .help("Writing modes and themes")

            Menu {
                ExportMenuItems(editor: editor)
            } label: {
                Label("Export", systemImage: "square.and.arrow.up")
            }
            .help("Export or print")
        }
    }
}

struct ExportMenuItems: View {
    let editor: EditorController

    var body: some View {
        Button("PDF…") { Exporter.export(.pdf, editor: editor) }
        Button("HTML…") { Exporter.export(.html, editor: editor) }
        Button("HTML (without styles)…") { Exporter.export(.htmlPlain, editor: editor) }
        Button("Image (PNG)…") { Exporter.export(.png, editor: editor) }
        Divider()
        Button("Word (.docx)…") { Exporter.export(.docx, editor: editor) }
        Button("OpenDocument (.odt)…") { Exporter.export(.odt, editor: editor) }
        Button("Rich Text (.rtf)…") { Exporter.export(.rtf, editor: editor) }
        Button("Plain Text…") { Exporter.export(.plainText, editor: editor) }
        Divider()
        Menu("Using Pandoc") {
            ForEach(Exporter.PandocFormat.allCases) { format in
                Button(format.title + "…") { Exporter.exportWithPandoc(format, editor: editor) }
            }
        }
        .disabled(Exporter.pandocPath == nil)
        Divider()
        Button("Print…") { Exporter.print(editor: editor) }
    }
}
