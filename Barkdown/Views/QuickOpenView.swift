//
//  QuickOpenView.swift
//  Barkdown
//

import SwiftUI

/// Typora's Quick Open (⇧⌘O): fuzzy-find a file in the sidebar folder or recent documents.
struct QuickOpenView: View {
    let editor: EditorController
    let fileURL: URL?

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var files: [URL] = []
    @State private var selected = 0
    @FocusState private var focused: Bool

    private var folder: URL? { Workspace.shared.folder(for: fileURL) }

    private var matches: [URL] {
        let q = query.lowercased().filter { !$0.isWhitespace }
        guard !q.isEmpty else { return Array(files.prefix(60)) }
        return files
            .compactMap { url -> (URL, Int)? in
                guard let score = Self.score(q, in: displayPath(url).lowercased()) else { return nil }
                return (url, score)
            }
            .sorted { $0.1 > $1.1 }
            .prefix(60)
            .map(\.0)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 16))
                    .foregroundStyle(.secondary)
                TextField("Open quickly…", text: $query)
                    .textFieldStyle(.plain)
                    .font(.system(size: 17))
                    .focused($focused)
                    .onSubmit(openSelected)
                    .onKeyPress(.downArrow) { move(1); return .handled }
                    .onKeyPress(.upArrow) { move(-1); return .handled }
                    .onKeyPress(.escape) { dismiss(); return .handled }
            }
            .padding(16)

            Divider()

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 2) {
                        let items = matches
                        if items.isEmpty {
                            Text(files.isEmpty ? "No Markdown files found" : "No matches")
                                .foregroundStyle(.secondary)
                                .padding(.vertical, 24)
                        }
                        ForEach(Array(items.enumerated()), id: \.element) { index, url in
                            row(url, selected: index == selected)
                                .id(index)
                                .onTapGesture {
                                    selected = index
                                    openSelected()
                                }
                        }
                    }
                    .padding(6)
                }
                .onChange(of: selected) { _, i in proxy.scrollTo(i) }
            }
            .frame(height: 340)
        }
        .frame(width: 560)
        .onAppear(perform: load)
        .onChange(of: query) { _, _ in selected = 0 }
    }

    private func row(_ url: URL, selected: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "doc.text")
                .foregroundStyle(selected ? .white : .secondary)
            VStack(alignment: .leading, spacing: 1) {
                Text(url.deletingPathExtension().lastPathComponent)
                    .font(.system(size: 13, weight: .medium))
                Text(displayPath(url.deletingLastPathComponent()))
                    .font(.system(size: 11))
                    .foregroundStyle(selected ? .white.opacity(0.8) : .secondary)
                    .lineLimit(1)
                    .truncationMode(.head)
            }
            Spacer()
        }
        .foregroundStyle(selected ? .white : .primary)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(selected ? Color.accentColor : .clear, in: RoundedRectangle(cornerRadius: 7))
        .contentShape(Rectangle())
    }

    private func displayPath(_ url: URL) -> String {
        if let folder, url.path.hasPrefix(folder.path) {
            let rel = String(url.path.dropFirst(folder.path.count)).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            return rel.isEmpty ? folder.lastPathComponent : rel
        }
        return (url.path as NSString).abbreviatingWithTildeInPath
    }

    private func load() {
        focused = true
        let recent = NSDocumentController.shared.recentDocumentURLs.filter(FileKinds.isMarkdown)
        files = recent
        guard let folder else { return }
        Task {
            let found = await Task.detached { FolderModel.markdownFiles(in: folder) }.value
            var seen = Set(recent)
            files = recent + found.filter { seen.insert($0).inserted }
        }
    }

    private func move(_ delta: Int) {
        let count = matches.count
        guard count > 0 else { return }
        selected = (selected + delta + count) % count
    }

    private func openSelected() {
        let items = matches
        guard items.indices.contains(selected) else { return }
        let url = items[selected]
        dismiss()
        editor.openFile?(url)
    }

    /// Subsequence match; consecutive characters and matches in the file name score higher.
    static func score(_ query: String, in text: String) -> Int? {
        var score = 0, streak = 0
        var qi = query.startIndex
        let fileStart = text.lastIndex(of: "/").map { text.index(after: $0) } ?? text.startIndex
        for i in text.indices {
            guard qi < query.endIndex else { break }
            if text[i] == query[qi] {
                streak += 1
                score += 1 + streak * 2 + (i >= fileStart ? 3 : 0)
                qi = query.index(after: qi)
            } else {
                streak = 0
            }
        }
        return qi == query.endIndex ? score - text.count / 10 : nil
    }
}

struct InsertTableSheet: View {
    let onInsert: (Int, Int) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var rows = 3
    @State private var columns = 3

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Insert Table").font(.headline)
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 10) {
                GridRow {
                    Text("Columns")
                    Stepper(value: $columns, in: 1...20) { Text("\(columns)").monospacedDigit().frame(width: 28) }
                }
                GridRow {
                    Text("Rows")
                    Stepper(value: $rows, in: 2...100) { Text("\(rows)").monospacedDigit().frame(width: 28) }
                }
            }
            TablePreview(rows: min(rows, 8), columns: min(columns, 8))
                .frame(height: 90)
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button("Insert") {
                    dismiss()
                    onInsert(rows, columns)
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 300)
    }
}

private struct TablePreview: View {
    let rows: Int
    let columns: Int

    var body: some View {
        Grid(horizontalSpacing: 2, verticalSpacing: 2) {
            ForEach(0..<rows, id: \.self) { r in
                GridRow {
                    ForEach(0..<columns, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(r == 0 ? Color.accentColor.opacity(0.35) : Color.secondary.opacity(0.18))
                    }
                }
            }
        }
    }
}
