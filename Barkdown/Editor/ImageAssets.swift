//
//  ImageAssets.swift
//  Barkdown
//

import Foundation

/// Decides where inserted images live and how they're referenced from Markdown,
/// following the "When inserting images" preference.
enum ImageAssets {
    /// Saves image data (pasted or dropped from a browser) and returns the Markdown path.
    static func save(data: Data, suggestedName: String, documentURL: URL?) -> String? {
        let folder = targetFolder(documentURL: documentURL)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let destination = uniqueURL(in: folder, name: sanitizedName(suggestedName))
            try data.write(to: destination)
            return linkPath(for: destination, documentURL: documentURL)
        } catch {
            print("[Barkdown] Could not save image: \(error)")
            return nil
        }
    }

    /// Places an existing image file (dropped or chosen) and returns the Markdown path.
    static func place(fileURL: URL, documentURL: URL?) -> String? {
        let prefs = Preferences.shared
        if prefs.imageLocation == .keepOriginal {
            return linkPath(for: fileURL, documentURL: documentURL)
        }
        let folder = targetFolder(documentURL: documentURL)
        if fileURL.deletingLastPathComponent().standardizedFileURL == folder.standardizedFileURL {
            return linkPath(for: fileURL, documentURL: documentURL)
        }
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let destination = uniqueURL(in: folder, name: fileURL.lastPathComponent)
            try FileManager.default.copyItem(at: fileURL, to: destination)
            return linkPath(for: destination, documentURL: documentURL)
        } catch {
            print("[Barkdown] Could not copy image: \(error)")
            return linkPath(for: fileURL, documentURL: documentURL)
        }
    }

    /// The path to write in Markdown: relative to the document when possible.
    static func linkPath(for url: URL, documentURL: URL?) -> String {
        guard Preferences.shared.relativeImagePaths, let docDir = documentURL?.deletingLastPathComponent() else {
            return url.path
        }
        return relativePath(from: docDir, to: url)
    }

    static func relativePath(from base: URL, to target: URL) -> String {
        let baseParts = base.standardizedFileURL.resolvingSymlinksInPath().pathComponents
        let targetParts = target.standardizedFileURL.resolvingSymlinksInPath().pathComponents
        var i = 0
        while i < baseParts.count, i < targetParts.count, baseParts[i] == targetParts[i] { i += 1 }
        // Only use relative paths when the files share more than the volume root.
        if i <= 1 { return target.path }
        let ups = Array(repeating: "..", count: baseParts.count - i)
        let rest = Array(targetParts[i...])
        let joined = (ups + rest).joined(separator: "/")
        return ups.isEmpty ? "./" + joined : joined
    }

    private static func targetFolder(documentURL: URL?) -> URL {
        let prefs = Preferences.shared
        guard let documentURL else {
            return URL.applicationSupportDirectory.appending(path: "Barkdown/Images", directoryHint: .isDirectory)
        }
        let dir = documentURL.deletingLastPathComponent()
        switch prefs.imageLocation {
        case .assetsFolder, .keepOriginal:
            return dir.appending(path: "assets", directoryHint: .isDirectory)
        case .documentAssetsFolder:
            return dir.appending(path: documentURL.deletingPathExtension().lastPathComponent + ".assets", directoryHint: .isDirectory)
        case .sameFolder:
            return dir
        case .customFolder:
            let custom = prefs.customImageFolder.trimmingCharacters(in: .whitespaces)
            if custom.isEmpty { return dir.appending(path: "assets", directoryHint: .isDirectory) }
            let expanded = NSString(string: custom).expandingTildeInPath
            return expanded.hasPrefix("/") ? URL(filePath: expanded, directoryHint: .isDirectory)
                                           : dir.appending(path: expanded, directoryHint: .isDirectory)
        }
    }

    private static func sanitizedName(_ name: String) -> String {
        var base = (name as NSString).deletingPathExtension
        var ext = (name as NSString).pathExtension.lowercased()
        if ext.isEmpty { ext = "png" }
        if base.isEmpty || base == "image" {
            let f = DateFormatter()
            f.dateFormat = "yyyyMMdd-HHmmss"
            base = "image-" + f.string(from: Date())
        }
        base = base.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
        return base + "." + ext
    }

    private static func uniqueURL(in folder: URL, name: String) -> URL {
        var candidate = folder.appending(path: name)
        let base = (name as NSString).deletingPathExtension, ext = (name as NSString).pathExtension
        var n = 2
        while FileManager.default.fileExists(atPath: candidate.path) {
            candidate = folder.appending(path: "\(base)-\(n).\(ext)")
            n += 1
        }
        return candidate
    }
}
