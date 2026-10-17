//
//  MarkdownDocument.swift
//  Barkdown
//

import SwiftUI
import UniformTypeIdentifiers

extension UTType {
    static let markdownText = UTType(importedAs: "net.daringfireball.markdown", conformingTo: .plainText)
}

/// A Markdown file. Text is kept with `\n` line endings in memory (which is what
/// the editor produces) and written back with the line endings it was read with.
struct MarkdownDocument: FileDocument {
    static let readableContentTypes: [UTType] = [.markdownText, .plainText]
    static let writableContentTypes: [UTType] = [.markdownText, .plainText]

    var text: String
    var usesCRLF = false

    init(text: String = "") {
        self.text = text
    }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        let raw = Self.decode(data)
        usesCRLF = raw.contains("\r\n")
        text = usesCRLF ? raw.replacingOccurrences(of: "\r\n", with: "\n") : raw
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        let output = usesCRLF ? text.replacingOccurrences(of: "\n", with: "\r\n") : text
        return FileWrapper(regularFileWithContents: Data(output.utf8))
    }

    static func decode(_ data: Data) -> String {
        if let s = String(data: data, encoding: .utf8) {
            return s.hasPrefix("\u{FEFF}") ? String(s.dropFirst()) : s
        }
        var converted: NSString?
        let encoding = NSString.stringEncoding(for: data, encodingOptions: nil, convertedString: &converted, usedLossyConversion: nil)
        if encoding != 0, let converted {
            return converted as String
        }
        return String(decoding: data, as: UTF8.self)
    }
}
