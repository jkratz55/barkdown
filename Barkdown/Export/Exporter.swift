//
//  Exporter.swift
//  Barkdown
//

import AppKit
import UniformTypeIdentifiers

/// Export, print and import, mirroring Typora's File ▸ Export and Import.
enum Exporter {
    enum Format {
        case pdf, html, htmlPlain, png, docx, odt, rtf, plainText

        var fileExtension: String {
            switch self {
            case .pdf: "pdf"
            case .html, .htmlPlain: "html"
            case .png: "png"
            case .docx: "docx"
            case .odt: "odt"
            case .rtf: "rtf"
            case .plainText: "txt"
            }
        }

        var title: String {
            switch self {
            case .pdf: "PDF"
            case .html: "HTML"
            case .htmlPlain: "HTML (without styles)"
            case .png: "Image"
            case .docx: "Word"
            case .odt: "OpenDocument"
            case .rtf: "Rich Text"
            case .plainText: "Plain Text"
            }
        }
    }

    enum PandocFormat: String, CaseIterable, Identifiable {
        case latex, epub, docx, rst, mediawiki, textile, asciidoc, org, opml, jats

        var id: String { rawValue }
        var title: String {
            switch self {
            case .latex: "LaTeX"
            case .epub: "EPUB"
            case .docx: "Word (Pandoc)"
            case .rst: "reStructuredText"
            case .mediawiki: "MediaWiki"
            case .textile: "Textile"
            case .asciidoc: "AsciiDoc"
            case .org: "Org Mode"
            case .opml: "OPML"
            case .jats: "JATS XML"
            }
        }
        var fileExtension: String {
            switch self {
            case .latex: "tex"
            case .epub: "epub"
            case .docx: "docx"
            case .rst: "rst"
            case .mediawiki: "wiki"
            case .textile: "textile"
            case .asciidoc: "adoc"
            case .org: "org"
            case .opml: "opml"
            case .jats: "xml"
            }
        }
    }

    static let pandocPath: String? = {
        let candidates = ["/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc", "/usr/bin/pandoc",
                          NSString(string: "~/.local/bin/pandoc").expandingTildeInPath]
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
    }()

    private static var exportTheme: String {
        let prefs = Preferences.shared
        return prefs.exportTheme.isEmpty ? prefs.lightTheme : prefs.exportTheme
    }

    private static func baseName(_ editor: EditorController) -> String {
        editor.fileURL?.deletingPathExtension().lastPathComponent ?? "Untitled"
    }

    private static func chooseDestination(_ editor: EditorController, ext: String, title: String) async -> URL? {
        let panel = NSSavePanel()
        panel.title = "Export as \(title)"
        panel.nameFieldStringValue = baseName(editor) + "." + ext
        if let type = UTType(filenameExtension: ext) { panel.allowedContentTypes = [type] }
        panel.canCreateDirectories = true
        panel.isExtensionHidden = false
        if let dir = editor.fileURL?.deletingLastPathComponent() { panel.directoryURL = dir }
        let response: NSApplication.ModalResponse
        if let window = editor.window {
            response = await panel.beginSheetModal(for: window)
        } else {
            response = panel.runModal()
        }
        return response == .OK ? panel.url : nil
    }

    static func export(_ format: Format, editor: EditorController) {
        Task { await run(format, editor: editor) }
    }

    private static func run(_ format: Format, editor: EditorController) async {
        guard let url = await chooseDestination(editor, ext: format.fileExtension, title: format.title) else { return }
        let prefs = Preferences.shared
        let sameFolder = url.deletingLastPathComponent().standardizedFileURL == editor.fileURL?.deletingLastPathComponent().standardizedFileURL
        do {
            switch format {
            case .html, .htmlPlain:
                guard let html = await editor.exportHTML([
                    "standalone": true, "styled": format == .html, "theme": exportTheme,
                    "absoluteImages": !sameFolder, "title": baseName(editor),
                ]) else { throw ExportError.render }
                try html.write(to: url, atomically: true, encoding: .utf8)
            case .pdf:
                guard let html = await editor.exportHTML([
                    "standalone": true, "styled": true, "theme": exportTheme, "absoluteImages": true, "print": true,
                    "title": baseName(editor),
                ]) else { throw ExportError.render }
                let renderer = OffscreenRenderer()
                await renderer.load(html: html)
                let ok = await renderer.writePDF(to: url, paper: prefs.paperSize.size, marginMM: prefs.pdfMargin, parent: editor.window)
                if !ok { throw ExportError.render }
            case .png:
                guard let html = await editor.exportHTML([
                    "standalone": true, "styled": true, "theme": exportTheme, "absoluteImages": true, "title": baseName(editor),
                ]) else { throw ExportError.render }
                let renderer = OffscreenRenderer(width: max(720, prefs.contentWidth + 96))
                await renderer.load(html: html)
                guard let data = await renderer.pngData() else { throw ExportError.render }
                try data.write(to: url)
            case .docx, .odt, .rtf, .plainText:
                guard let html = await editor.exportHTML([
                    "standalone": true, "styled": false, "absoluteImages": true, "mathMode": "tex", "title": baseName(editor),
                ]) else { throw ExportError.render }
                let attributed = try attributedString(fromHTML: html)
                let data: Data
                switch format {
                case .docx: data = try attributed.data(from: NSRange(location: 0, length: attributed.length),
                                                       documentAttributes: [.documentType: NSAttributedString.DocumentType.officeOpenXML])
                case .odt: data = try attributed.data(from: NSRange(location: 0, length: attributed.length),
                                                      documentAttributes: [.documentType: NSAttributedString.DocumentType.openDocument])
                case .rtf: data = try attributed.data(from: NSRange(location: 0, length: attributed.length),
                                                      documentAttributes: [.documentType: NSAttributedString.DocumentType.rtf])
                default: data = Data(attributed.string.utf8)
                }
                try data.write(to: url)
            }
            NSDocumentController.shared.noteNewRecentDocumentURL(url)
            revealIfNeeded(url)
        } catch {
            present(error, in: editor.window)
        }
    }

    private static func attributedString(fromHTML html: String) throws -> NSAttributedString {
        // A plain, document-like base style for rich-text formats.
        let styled = html.replacingOccurrences(of: "</head>", with: """
            <style>
            body { font-family: -apple-system, 'Helvetica Neue', sans-serif; font-size: 12pt; line-height: 1.5; }
            pre, code { font-family: Menlo, monospace; font-size: 10pt; }
            pre { background: #f5f5f5; padding: 8px; }
            blockquote { color: #555; border-left: 3px solid #ccc; padding-left: 10px; }
            table { border-collapse: collapse; } th, td { border: 1px solid #ccc; padding: 4px 8px; }
            </style></head>
            """)
        return try NSAttributedString(data: Data(styled.utf8),
                                      options: [.documentType: NSAttributedString.DocumentType.html,
                                                .characterEncoding: String.Encoding.utf8.rawValue],
                                      documentAttributes: nil)
    }

    static func exportWithPandoc(_ format: PandocFormat, editor: EditorController) {
        Task {
            guard let pandoc = pandocPath else { return }
            guard let url = await chooseDestination(editor, ext: format.fileExtension, title: format.title) else { return }
            let text = await editor.currentText()
            let input = FileManager.default.temporaryDirectory.appending(path: "barkdown-\(UUID().uuidString).md")
            do {
                try text.write(to: input, atomically: true, encoding: .utf8)
                defer { try? FileManager.default.removeItem(at: input) }
                let target = format == .docx ? "docx" : format.rawValue
                var args = [input.path, "-f", "markdown+tex_math_dollars+mark+superscript+subscript+yaml_metadata_block+emoji",
                            "-t", target, "-s", "-o", url.path]
                if let dir = editor.fileURL?.deletingLastPathComponent() { args += ["--resource-path", dir.path] }
                try await runProcess(pandoc, args, cwd: editor.fileURL?.deletingLastPathComponent())
                revealIfNeeded(url)
            } catch {
                present(error, in: editor.window)
            }
        }
    }

    private static func runProcess(_ path: String, _ args: [String], cwd: URL?) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let process = Process()
            process.executableURL = URL(filePath: path)
            process.arguments = args
            if let cwd { process.currentDirectoryURL = cwd }
            let errors = Pipe()
            process.standardError = errors
            process.terminationHandler = { p in
                let message = String(decoding: errors.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
                if p.terminationStatus == 0 { continuation.resume() }
                else { continuation.resume(throwing: ExportError.pandoc(message.isEmpty ? "Pandoc failed (\(p.terminationStatus))." : message)) }
            }
            do { try process.run() } catch { continuation.resume(throwing: error) }
        }
    }

    static func print(editor: EditorController) {
        Task {
            guard let html = await editor.exportHTML([
                "standalone": true, "styled": true, "theme": exportTheme, "absoluteImages": true, "print": true,
                "title": baseName(editor),
            ]) else { return }
            let renderer = OffscreenRenderer()
            await renderer.load(html: html)
            await renderer.print(paper: Preferences.shared.paperSize.size, marginMM: Preferences.shared.pdfMargin, parent: editor.window)
        }
    }

    // MARK: Import

    static func importDocument(editor: EditorController) {
        let panel = NSOpenPanel()
        panel.title = "Import"
        panel.message = "Choose a Word, OpenDocument, RTF, HTML or web archive file to convert to Markdown"
        panel.allowedContentTypes = [UTType(filenameExtension: "docx"), UTType(filenameExtension: "doc"),
                                     UTType(filenameExtension: "odt"), .rtf, .rtfd, .html, .webArchive, .plainText]
            .compactMap { $0 }
        let finish: (NSApplication.ModalResponse) -> Void = { response in
            guard response == .OK, let url = panel.url else { return }
            Task {
                do {
                    let markdown = try await convertToMarkdown(url, editor: editor)
                    editor.openNewDocument?(markdown)
                } catch {
                    present(error, in: editor.window)
                }
            }
        }
        if let window = editor.window { panel.beginSheetModal(for: window, completionHandler: finish) } else { finish(panel.runModal()) }
    }

    private static func convertToMarkdown(_ url: URL, editor: EditorController) async throws -> String {
        let ext = url.pathExtension.lowercased()
        if FileKinds.isMarkdown(url) {
            return try String(contentsOf: url, encoding: .utf8)
        }
        if ext == "docx" || ext == "odt", let pandoc = pandocPath {
            let out = FileManager.default.temporaryDirectory.appending(path: "barkdown-import-\(UUID().uuidString).md")
            defer { try? FileManager.default.removeItem(at: out) }
            try await runProcess(pandoc, [url.path, "-t", "gfm+tex_math_dollars", "--wrap=none", "-o", out.path], cwd: nil)
            return try String(contentsOf: out, encoding: .utf8)
        }
        let html: String
        if ext == "html" || ext == "htm" {
            html = String(decoding: try Data(contentsOf: url), as: UTF8.self)
        } else {
            let attributed = try NSAttributedString(url: url, options: [:], documentAttributes: nil)
            let data = try attributed.data(from: NSRange(location: 0, length: attributed.length),
                                           documentAttributes: [.documentType: NSAttributedString.DocumentType.html])
            html = String(decoding: data, as: UTF8.self)
        }
        guard let markdown = await editor.htmlToMarkdown(html) else { throw ExportError.render }
        return markdown
    }

    // MARK: Helpers

    private static func revealIfNeeded(_ url: URL) {
        if NSEvent.modifierFlags.contains(.option) { NSWorkspace.shared.activateFileViewerSelecting([url]) }
    }

    private static func present(_ error: Error, in window: NSWindow?) {
        let alert = NSAlert(error: error)
        if let window { alert.beginSheetModal(for: window) } else { alert.runModal() }
    }

    enum ExportError: LocalizedError {
        case render
        case pandoc(String)

        var errorDescription: String? {
            switch self {
            case .render: "The document couldn’t be rendered for export."
            case .pandoc(let message): message
            }
        }
    }
}
