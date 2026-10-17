//
//  FilesView.swift
//  Barkdown
//

import SwiftUI

/// The Files tab: a folder tree or a Typora-style list of articles with excerpts.
struct FilesView: View {
    let model: FolderModel
    let editor: EditorController
    let fileURL: URL?

    @State private var selection: URL?
    @State private var prompt: NamePrompt?
    private var prefs = Preferences.shared

    init(model: FolderModel, editor: EditorController, fileURL: URL?) {
        self.model = model
        self.editor = editor
        self.fileURL = fileURL
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Group {
                if prefs.fileViewMode == .tree {
                    tree
                } else {
                    articleList
                }
            }
        }
        .onAppear { selection = fileURL }
        .onChange(of: fileURL) { _, url in selection = url }
        .onChange(of: selection) { _, url in
            guard let url, url != fileURL else { return }
            var isDir: ObjCBool = false
            guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir), !isDir.boolValue else { return }
            if FileKinds.isMarkdown(url) { editor.openFile?(url) } else { NSWorkspace.shared.open(url) }
        }
        .onChange(of: prefs.showAllFiles) { _, _ in model.reload() }
        .alert(prompt?.title ?? "", isPresented: Binding(get: { prompt != nil }, set: { if !$0 { prompt = nil } })) {
            NamePromptFields(prompt: $prompt, model: model, editor: editor)
        }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Image(systemName: "folder.fill")
                .foregroundStyle(.secondary)
                .font(.system(size: 11))
            Text(model.url.lastPathComponent)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer()
            Menu {
                Picker("View As", selection: Binding(get: { prefs.fileViewMode }, set: { prefs.fileViewMode = $0 })) {
                    Label("File Tree", systemImage: "list.bullet.indent").tag(FileViewMode.tree)
                    Label("File List", systemImage: "doc.text").tag(FileViewMode.list)
                }
                .pickerStyle(.inline)
                Toggle("Show All Files", isOn: Binding(get: { prefs.showAllFiles }, set: { prefs.showAllFiles = $0 }))
                Divider()
                Button("New File…") { prompt = .newFile(model.url) }
                Button("New Folder…") { prompt = .newFolder(model.url) }
                Divider()
                Button("Open Folder…") { Workspace.shared.chooseFolder(in: editor.window) }
                Button("Reveal in Finder") { NSWorkspace.shared.activateFileViewerSelecting([model.url]) }
                Button("Refresh") { model.reload() }
                if Workspace.shared.rootURL != nil {
                    Divider()
                    Button("Close Folder") { Workspace.shared.rootURL = nil }
                }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .fixedSize()
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 4)
    }

    private var tree: some View {
        List(model.root, children: \.children, selection: $selection) { node in
            Label {
                Text(node.isDirectory ? node.name : (FileKinds.isMarkdown(node.url) ? node.url.deletingPathExtension().lastPathComponent : node.name))
                    .lineLimit(1)
            } icon: {
                Image(systemName: icon(for: node))
                    .foregroundStyle(node.isDirectory ? Color.accentColor : .secondary)
            }
            .tag(node.url)
            .contextMenu { contextMenu(for: node.url, isDirectory: node.isDirectory) }
        }
        .id(model.revision)
        .contextMenu {
            Button("New File…") { prompt = .newFile(model.url) }
            Button("New Folder…") { prompt = .newFolder(model.url) }
        }
    }

    private var articleList: some View {
        List(model.articles, selection: $selection) { item in
            VStack(alignment: .leading, spacing: 3) {
                Text(item.title)
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
                if !item.excerpt.isEmpty {
                    Text(item.excerpt)
                        .font(.system(size: 11.5))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                Text(item.modified, format: .relative(presentation: .named))
                    .font(.system(size: 10.5))
                    .foregroundStyle(.tertiary)
            }
            .padding(.vertical, 4)
            .tag(item.url)
            .contextMenu { contextMenu(for: item.url, isDirectory: false) }
        }
    }

    private func icon(for node: FileNode) -> String {
        if node.isDirectory { return "folder" }
        if FileKinds.isMarkdown(node.url) { return "doc.text" }
        if FileKinds.isImage(node.url) { return "photo" }
        return "doc"
    }

    @ViewBuilder
    private func contextMenu(for url: URL, isDirectory: Bool) -> some View {
        let folder = isDirectory ? url : url.deletingLastPathComponent()
        if !isDirectory {
            Button("Open") { editor.openFile?(url) }
            Button("Open in Default App") { NSWorkspace.shared.open(url) }
            Divider()
        }
        Button("New File…") { prompt = .newFile(folder) }
        Button("New Folder…") { prompt = .newFolder(folder) }
        Divider()
        Button("Rename…") { prompt = .rename(url) }
        Button("Duplicate") { model.duplicate(url) }
        Button("Move to Trash", role: .destructive) { model.trash(url) }
        Divider()
        Button("Reveal in Finder") { NSWorkspace.shared.activateFileViewerSelecting([url]) }
        Button("Copy Path") {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(url.path, forType: .string)
        }
        if isDirectory {
            Button("Open as Sidebar Folder") { Workspace.shared.rootURL = url }
        }
    }
}

/// Text-entry prompts for file operations.
enum NamePrompt: Identifiable {
    case newFile(URL), newFolder(URL), rename(URL)

    var id: String {
        switch self {
        case .newFile(let u): "file" + u.path
        case .newFolder(let u): "folder" + u.path
        case .rename(let u): "rename" + u.path
        }
    }

    var title: String {
        switch self {
        case .newFile: "New File"
        case .newFolder: "New Folder"
        case .rename(let u): "Rename “\(u.lastPathComponent)”"
        }
    }

    var initialName: String {
        switch self {
        case .newFile: "Untitled.md"
        case .newFolder: "New Folder"
        case .rename(let u): u.lastPathComponent
        }
    }
}

private struct NamePromptFields: View {
    @Binding var prompt: NamePrompt?
    let model: FolderModel
    let editor: EditorController
    @State private var name = ""

    var body: some View {
        TextField("Name", text: $name)
            .onAppear { name = prompt?.initialName ?? "" }
        Button("Cancel", role: .cancel) { prompt = nil }
        Button(confirmTitle) { commit() }
            .keyboardShortcut(.defaultAction)
    }

    private var confirmTitle: String {
        if case .rename = prompt { return "Rename" }
        return "Create"
    }

    private func commit() {
        guard let prompt else { return }
        switch prompt {
        case .newFile(let folder):
            if let url = model.createFile(named: name, in: folder) { editor.openFile?(url) }
        case .newFolder(let folder):
            model.createFolder(named: name, in: folder)
        case .rename(let url):
            model.rename(url, to: name)
        }
        self.prompt = nil
    }
}
