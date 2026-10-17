//
//  FolderSearchView.swift
//  Barkdown
//

import SwiftUI

/// Full-text search across every Markdown file in the sidebar folder.
struct FolderSearchView: View {
    let model: FolderModel
    let editor: EditorController
    let fileURL: URL?

    @State private var query = ""
    @State private var caseSensitive = false
    @State private var results: [SearchResult] = []
    @State private var searching = false
    @State private var task: Task<Void, Never>?
    @FocusState private var fieldFocused: Bool

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Search in \(model.url.lastPathComponent)", text: $query)
                    .textFieldStyle(.plain)
                    .focused($fieldFocused)
                    .onSubmit { run() }
                if searching {
                    ProgressView().controlSize(.small)
                }
                Toggle(isOn: $caseSensitive) {
                    Text("Aa").font(.system(size: 11, weight: .semibold, design: .monospaced))
                }
                .toggleStyle(.button)
                .buttonStyle(.borderless)
                .help("Match Case")
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(.quaternary.opacity(0.6), in: RoundedRectangle(cornerRadius: 8))
            .padding(.horizontal, 12)

            if results.isEmpty {
                Spacer()
                if !query.isEmpty && !searching {
                    Text("No results").foregroundStyle(.secondary).font(.callout)
                }
                Spacer()
            } else {
                List {
                    ForEach(results) { result in
                        Section {
                            ForEach(result.hits) { hit in
                                Button {
                                    open(result.url, line: hit.line)
                                } label: {
                                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                                        Text("\(hit.line)")
                                            .font(.system(size: 10, design: .monospaced))
                                            .foregroundStyle(.tertiary)
                                            .frame(minWidth: 22, alignment: .trailing)
                                        highlighted(hit.text)
                                            .font(.system(size: 12))
                                            .lineLimit(2)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        } header: {
                            Button {
                                open(result.url, line: nil)
                            } label: {
                                HStack {
                                    Image(systemName: "doc.text")
                                    Text(result.url.deletingPathExtension().lastPathComponent).lineLimit(1)
                                    Spacer()
                                    Text("\(result.hits.count)").foregroundStyle(.tertiary)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .onChange(of: query) { _, _ in schedule() }
        .onChange(of: caseSensitive) { _, _ in run() }
        .onAppear { fieldFocused = true }
    }

    private func highlighted(_ text: String) -> Text {
        guard !query.isEmpty,
              let range = text.range(of: query, options: caseSensitive ? [] : [.caseInsensitive, .diacriticInsensitive]) else {
            return Text(text)
        }
        let match = Text(text[range]).bold().foregroundStyle(Color.accentColor)
        return Text("\(Text(text[..<range.lowerBound]))\(match)\(Text(text[range.upperBound...]))")
    }

    private func schedule() {
        task?.cancel()
        task = Task {
            try? await Task.sleep(for: .milliseconds(250))
            if !Task.isCancelled { run() }
        }
    }

    private func run() {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else {
            results = []
            return
        }
        searching = true
        Task {
            let found = await model.search(q, caseSensitive: caseSensitive)
            if q == query.trimmingCharacters(in: .whitespaces) {
                results = found
                searching = false
            }
        }
    }

    private func open(_ url: URL, line: Int?) {
        if url == fileURL {
            editor.find(query)
        } else {
            Workspace.shared.pendingFinds[url] = query
            editor.openFile?(url)
        }
    }
}
