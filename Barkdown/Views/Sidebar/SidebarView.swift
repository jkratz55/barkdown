//
//  SidebarView.swift
//  Barkdown
//

import SwiftUI

struct SidebarView: View {
    let editor: EditorController
    let fileURL: URL?
    private var workspace = Workspace.shared

    init(editor: EditorController, fileURL: URL?) {
        self.editor = editor
        self.fileURL = fileURL
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("Sidebar", selection: Binding(get: { editor.sidebarTab }, set: { editor.sidebarTab = $0 })) {
                Image(systemName: "folder").help("Files (⇧⌘3)").tag(SidebarTab.files)
                Image(systemName: "list.bullet.indent").help("Outline (⇧⌘1)").tag(SidebarTab.outline)
                Image(systemName: "magnifyingglass").help("Search (⇧⌘F)").tag(SidebarTab.search)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(.horizontal, 12)
            .padding(.top, 6)
            .padding(.bottom, 8)

            Group {
                switch editor.sidebarTab {
                case .files:
                    if let folder = workspace.folder(for: fileURL) {
                        FilesView(model: workspace.model(for: folder), editor: editor, fileURL: fileURL)
                            .id(folder)
                    } else {
                        NoFolderView(editor: editor)
                    }
                case .outline:
                    OutlineSidebar(editor: editor)
                case .search:
                    if let folder = workspace.folder(for: fileURL) {
                        FolderSearchView(model: workspace.model(for: folder), editor: editor, fileURL: fileURL)
                            .id(folder)
                    } else {
                        NoFolderView(editor: editor)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

struct NoFolderView: View {
    let editor: EditorController

    var body: some View {
        ContentUnavailableView {
            Label("No Folder", systemImage: "folder")
        } description: {
            Text("Open a folder to browse its Markdown files here.")
        } actions: {
            Button("Open Folder…") { Workspace.shared.chooseFolder(in: editor.window) }
        }
    }
}

// MARK: - Outline

struct OutlineSidebar: View {
    let editor: EditorController

    var body: some View {
        if editor.outline.isEmpty {
            ContentUnavailableView {
                Label("No Headings", systemImage: "list.bullet.indent")
            } description: {
                Text("Headings in this document appear here.")
            }
        } else {
            let minLevel = editor.outline.map(\.level).min() ?? 1
            ScrollViewReader { proxy in
                List(editor.outline, selection: Binding(
                    get: { editor.activeHeading >= 0 ? editor.activeHeading : nil },
                    set: { id in
                        if let id, let item = editor.outline.first(where: { $0.id == id }) { editor.scroll(to: item) }
                    })) { item in
                    Text(item.text.isEmpty ? "Untitled" : item.text)
                        .font(.system(size: item.level == minLevel ? 13 : 12.5, weight: item.level == minLevel ? .semibold : .regular))
                        .foregroundStyle(item.level > minLevel + 1 ? .secondary : .primary)
                        .lineLimit(2)
                        .padding(.leading, CGFloat(item.level - minLevel) * 14)
                        .tag(item.id)
                }
                .onChange(of: editor.activeHeading) { _, index in
                    if index >= 0 { withAnimation { proxy.scrollTo(index) } }
                }
            }
        }
    }
}
