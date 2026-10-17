//
//  Workspace.swift
//  Barkdown
//

import AppKit
import CoreServices
import Observation

/// A file or folder in the sidebar tree. Children load lazily the first time a
/// folder is expanded.
final class FileNode: Identifiable, Hashable {
    let url: URL
    let isDirectory: Bool
    private let showAll: Bool
    private var cachedChildren: [FileNode]?

    var id: URL { url }
    var name: String { url.lastPathComponent }

    init(url: URL, isDirectory: Bool, showAll: Bool) {
        self.url = url
        self.isDirectory = isDirectory
        self.showAll = showAll
    }

    var children: [FileNode]? {
        guard isDirectory else { return nil }
        if let cachedChildren { return cachedChildren }
        let loaded = FileNode.list(url, showAll: showAll)
        cachedChildren = loaded
        return loaded
    }

    static func list(_ folder: URL, showAll: Bool) -> [FileNode] {
        let keys: [URLResourceKey] = [.isDirectoryKey, .isPackageKey]
        let items = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles])) ?? []
        return items.compactMap { url -> FileNode? in
            let values = try? url.resourceValues(forKeys: Set(keys))
            let dir = (values?.isDirectory ?? false) && !(values?.isPackage ?? false)
            if !dir && !showAll && !FileKinds.isMarkdown(url) { return nil }
            return FileNode(url: url, isDirectory: dir, showAll: showAll)
        }
        .sorted { a, b in
            if a.isDirectory != b.isDirectory { return a.isDirectory }
            return a.name.localizedStandardCompare(b.name) == .orderedAscending
        }
    }

    static func == (a: FileNode, b: FileNode) -> Bool { a.url == b.url }
    func hash(into hasher: inout Hasher) { hasher.combine(url) }
}

struct ArticleItem: Identifiable, Hashable {
    let url: URL
    let title: String
    let excerpt: String
    let modified: Date
    var id: URL { url }
}

struct SearchHit: Identifiable, Hashable {
    let id = UUID()
    let line: Int
    let text: String
}

struct SearchResult: Identifiable, Hashable {
    let url: URL
    let hits: [SearchHit]
    var id: URL { url }
}

/// The folder shown in the sidebar, watched for changes.
@Observable
final class FolderModel {
    let url: URL
    private(set) var root: [FileNode] = []
    private(set) var articles: [ArticleItem] = []
    private(set) var revision = 0
    @ObservationIgnored private var stream: FSEventStreamRef?
    @ObservationIgnored private var reloadTask: Task<Void, Never>?

    init(url: URL) {
        self.url = url
        reload()
        startWatching()
    }

    deinit {
        if let stream {
            FSEventStreamStop(stream)
            FSEventStreamInvalidate(stream)
            FSEventStreamRelease(stream)
        }
    }

    func reload() {
        root = FileNode.list(url, showAll: Preferences.shared.showAllFiles)
        revision += 1
        loadArticles()
    }

    private func loadArticles() {
        reloadTask?.cancel()
        let folder = url
        reloadTask = Task {
            let items = await Task.detached(priority: .utility) { FolderModel.scanArticles(folder) }.value
            if !Task.isCancelled { self.articles = items }
        }
    }

    nonisolated static func markdownFiles(in folder: URL, limit: Int = 5000) -> [URL] {
        let keys: [URLResourceKey] = [.isRegularFileKey, .contentModificationDateKey]
        guard let e = FileManager.default.enumerator(at: folder, includingPropertiesForKeys: keys,
                                                     options: [.skipsHiddenFiles, .skipsPackageDescendants]) else { return [] }
        var out: [URL] = []
        for case let url as URL in e {
            let name = url.lastPathComponent
            if name == "node_modules" || name.hasSuffix(".assets") { e.skipDescendants(); continue }
            let ext = url.pathExtension.lowercased()
            if ["md", "markdown", "mdown", "mkd", "mkdn", "mdwn", "mdtxt", "mdtext"].contains(ext) { out.append(url) }
            if out.count >= limit { break }
        }
        return out
    }

    nonisolated static func scanArticles(_ folder: URL) -> [ArticleItem] {
        markdownFiles(in: folder, limit: 2000).compactMap { url in
            let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
            defer { try? handle.close() }
            let data = (try? handle.read(upToCount: 2048)) ?? Data()
            let text = String(decoding: data, as: UTF8.self)
            let (title, excerpt) = summarize(text, fallback: url.deletingPathExtension().lastPathComponent)
            return ArticleItem(url: url, title: title, excerpt: excerpt, modified: modified)
        }
        .sorted { $0.modified > $1.modified }
    }

    nonisolated static func summarize(_ text: String, fallback: String) -> (String, String) {
        var body = text
        if body.hasPrefix("---"), let end = body.range(of: "\n---", range: body.index(body.startIndex, offsetBy: 3)..<body.endIndex) {
            body = String(body[end.upperBound...])
        }
        var title: String?
        var lines: [String] = []
        for raw in body.split(separator: "\n", omittingEmptySubsequences: true) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.isEmpty || line.hasPrefix("```") || line.hasPrefix("$$") || line.hasPrefix("|") || line.hasPrefix("![") { continue }
            if title == nil, line.hasPrefix("#") {
                title = line.drop(while: { $0 == "#" }).trimmingCharacters(in: .whitespaces)
                continue
            }
            let cleaned = line.replacingOccurrences(of: #"^([#>*+-]|\d+\.)+\s*"#, with: "", options: .regularExpression)
                .replacingOccurrences(of: #"[*_`~=]"#, with: "", options: .regularExpression)
                .replacingOccurrences(of: #"\[([^\]]*)\]\([^)]*\)"#, with: "$1", options: .regularExpression)
            if !cleaned.isEmpty { lines.append(cleaned) }
            if lines.joined(separator: " ").count > 160 { break }
        }
        return (title ?? fallback, String(lines.joined(separator: " ").prefix(160)))
    }

    func search(_ query: String, caseSensitive: Bool = false) async -> [SearchResult] {
        let folder = url
        return await Task.detached(priority: .userInitiated) {
            let options: String.CompareOptions = caseSensitive ? [] : [.caseInsensitive, .diacriticInsensitive]
            var results: [SearchResult] = []
            for file in FolderModel.markdownFiles(in: folder) {
                if Task.isCancelled { break }
                guard let text = try? String(contentsOf: file, encoding: .utf8) else { continue }
                var hits: [SearchHit] = []
                let nameMatch = file.lastPathComponent.range(of: query, options: options) != nil
                for (i, line) in text.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
                    guard let r = line.range(of: query, options: options) else { continue }
                    // Keep a window of context around the match.
                    let start = line.index(r.lowerBound, offsetBy: -40, limitedBy: line.startIndex) ?? line.startIndex
                    let end = line.index(r.upperBound, offsetBy: 80, limitedBy: line.endIndex) ?? line.endIndex
                    let snippet = (start > line.startIndex ? "…" : "") + line[start..<end].trimmingCharacters(in: .whitespaces)
                    hits.append(SearchHit(line: i + 1, text: snippet))
                    if hits.count >= 20 { break }
                }
                if !hits.isEmpty || nameMatch { results.append(SearchResult(url: file, hits: hits)) }
                if results.count >= 200 { break }
            }
            return results
        }.value
    }

    // MARK: File system watching

    private func startWatching() {
        var context = FSEventStreamContext(version: 0, info: Unmanaged.passUnretained(self).toOpaque(), retain: nil, release: nil, copyDescription: nil)
        let callback: FSEventStreamCallback = { _, info, _, _, _, _ in
            guard let info else { return }
            let model = Unmanaged<FolderModel>.fromOpaque(info).takeUnretainedValue()
            DispatchQueue.main.async { model.scheduleReload() }
        }
        guard let stream = FSEventStreamCreate(nil, callback, &context, [url.path] as CFArray,
                                               FSEventStreamEventId(kFSEventStreamEventIdSinceNow), 0.4,
                                               FSEventStreamCreateFlags(kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagNoDefer)) else { return }
        FSEventStreamSetDispatchQueue(stream, .main)
        FSEventStreamStart(stream)
        self.stream = stream
    }

    @ObservationIgnored private var pendingReload: DispatchWorkItem?
    nonisolated func scheduleReload() {
        MainActor.assumeIsolated {
            pendingReload?.cancel()
            let item = DispatchWorkItem { [weak self] in self?.reload() }
            pendingReload = item
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: item)
        }
    }

    // MARK: File operations

    @discardableResult
    func createFile(named name: String, in folder: URL) -> URL? {
        var file = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if file.isEmpty { return nil }
        if (file as NSString).pathExtension.isEmpty { file += ".md" }
        let url = folder.appending(path: file)
        guard !FileManager.default.fileExists(atPath: url.path) else { NSSound.beep(); return nil }
        let title = (file as NSString).deletingPathExtension
        do {
            try Data("# \(title)\n\n".utf8).write(to: url)
            reload()
            return url
        } catch {
            NSAlert(error: error).runModal()
            return nil
        }
    }

    func createFolder(named name: String, in folder: URL) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            try FileManager.default.createDirectory(at: folder.appending(path: trimmed, directoryHint: .isDirectory), withIntermediateDirectories: false)
            reload()
        } catch {
            NSAlert(error: error).runModal()
        }
    }

    @discardableResult
    func rename(_ url: URL, to name: String) -> URL? {
        var newName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !newName.isEmpty, newName != url.lastPathComponent else { return nil }
        if (newName as NSString).pathExtension.isEmpty, !url.pathExtension.isEmpty, !url.hasDirectoryPath {
            newName += "." + url.pathExtension
        }
        let destination = url.deletingLastPathComponent().appending(path: newName)
        do {
            try FileManager.default.moveItem(at: url, to: destination)
            reload()
            return destination
        } catch {
            NSAlert(error: error).runModal()
            return nil
        }
    }

    func duplicate(_ url: URL) {
        let base = url.deletingPathExtension().lastPathComponent, ext = url.pathExtension
        var n = 1
        var destination: URL
        repeat {
            let suffix = n == 1 ? " copy" : " copy \(n)"
            destination = url.deletingLastPathComponent().appending(path: base + suffix + (ext.isEmpty ? "" : "." + ext))
            n += 1
        } while FileManager.default.fileExists(atPath: destination.path)
        do {
            try FileManager.default.copyItem(at: url, to: destination)
            reload()
        } catch {
            NSAlert(error: error).runModal()
        }
    }

    func trash(_ url: URL) {
        do {
            try FileManager.default.trashItem(at: url, resultingItemURL: nil)
            reload()
        } catch {
            NSAlert(error: error).runModal()
        }
    }
}

/// App-wide sidebar state: the folder opened with "Open Folder…" (if any).
@Observable
final class Workspace {
    static let shared = Workspace()

    var rootURL: URL? {
        didSet { UserDefaults.standard.set(rootURL?.path, forKey: "workspaceRoot") }
    }
    @ObservationIgnored private var models: [URL: FolderModel] = [:]
    /// Searches to run once a document opened from the search sidebar is ready.
    @ObservationIgnored var pendingFinds: [URL: String] = [:]
    /// The window that asked to open a file, so the new document can join it as a tab.
    @ObservationIgnored weak var tabParent: NSWindow?

    private init() {
        if let path = UserDefaults.standard.string(forKey: "workspaceRoot"),
           FileManager.default.fileExists(atPath: path) {
            rootURL = URL(filePath: path, directoryHint: .isDirectory)
        }
    }

    /// The folder a window's sidebar shows: the opened folder, or the document's own folder.
    func folder(for documentURL: URL?) -> URL? {
        if let rootURL {
            if let documentURL, !documentURL.path.hasPrefix(rootURL.path + "/") {
                return documentURL.deletingLastPathComponent()
            }
            return rootURL
        }
        return documentURL?.deletingLastPathComponent()
    }

    func model(for folder: URL) -> FolderModel {
        if let m = models[folder] { return m }
        let m = FolderModel(url: folder)
        models[folder] = m
        return m
    }

    func reloadAll() {
        models.values.forEach { $0.reload() }
    }

    func chooseFolder(in window: NSWindow?) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.prompt = "Open"
        panel.message = "Choose a folder to show in the sidebar"
        let finish: (NSApplication.ModalResponse) -> Void = { response in
            if response == .OK, let url = panel.url {
                self.rootURL = url
                NSDocumentController.shared.noteNewRecentDocumentURL(url)
            }
        }
        if let window { panel.beginSheetModal(for: window, completionHandler: finish) } else { finish(panel.runModal()) }
    }
}
