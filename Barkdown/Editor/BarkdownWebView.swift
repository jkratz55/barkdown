//
//  BarkdownWebView.swift
//  Barkdown
//

import AppKit
import SwiftUI
import UniformTypeIdentifiers
import WebKit

/// The editor's web view. Handles file drops natively, since web content never
/// sees the paths of files dragged in from Finder.
final class BarkdownWebView: WKWebView {
    weak var controller: EditorController?

    override init(frame: CGRect, configuration: WKWebViewConfiguration) {
        super.init(frame: frame, configuration: configuration)
        registerForDraggedTypes([.fileURL])
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
    }

    private func fileURLs(from pasteboard: NSPasteboard) -> [URL] {
        pasteboard.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL] ?? []
    }

    override func draggingEntered(_ sender: any NSDraggingInfo) -> NSDragOperation {
        if !fileURLs(from: sender.draggingPasteboard).isEmpty { return .copy }
        return super.draggingEntered(sender)
    }

    override func draggingUpdated(_ sender: any NSDraggingInfo) -> NSDragOperation {
        if !fileURLs(from: sender.draggingPasteboard).isEmpty { return .copy }
        return super.draggingUpdated(sender)
    }

    override func performDragOperation(_ sender: any NSDraggingInfo) -> Bool {
        let urls = fileURLs(from: sender.draggingPasteboard)
        guard !urls.isEmpty, let controller else { return super.performDragOperation(sender) }
        var point = convert(sender.draggingLocation, from: nil)
        if !isFlipped { point.y = bounds.height - point.y }
        handle(urls: urls, at: point, controller: controller)
        return true
    }

    private func handle(urls: [URL], at point: NSPoint?, controller: EditorController) {
        var images: [String] = []
        for url in urls {
            if FileKinds.isImage(url) {
                if let path = ImageAssets.place(fileURL: url, documentURL: controller.fileURL) { images.append(path) }
            } else if FileKinds.isMarkdown(url) {
                controller.openFile?(url)
            } else {
                // Other files become links.
                let path = ImageAssets.linkPath(for: url, documentURL: controller.fileURL)
                controller.insertText("[\(url.lastPathComponent)](\(path))")
            }
        }
        if !images.isEmpty { controller.insertImages(images, at: point) }
    }
}

nonisolated enum FileKinds {
    static let markdownExtensions: Set<String> = ["md", "markdown", "mdown", "mkd", "mkdn", "mdwn", "mdtxt", "mdtext", "txt", "text"]
    static let imageExtensions: Set<String> = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff", "tif", "heic", "avif", "ico"]

    static func isMarkdown(_ url: URL) -> Bool { markdownExtensions.contains(url.pathExtension.lowercased()) }
    static func isImage(_ url: URL) -> Bool { imageExtensions.contains(url.pathExtension.lowercased()) }
}

/// Hosts the controller's web view in SwiftUI and keeps it in sync with the document.
struct EditorWebView: NSViewRepresentable {
    @Binding var text: String
    let controller: EditorController
    let config: EditorConfig

    func makeNSView(context: Context) -> BarkdownWebView {
        let webView = controller.makeWebView()
        controller.onTextChange = { newText in
            if text != newText { text = newText }
        }
        controller.sync(text: text, config: config)
        return webView
    }

    func updateNSView(_ webView: BarkdownWebView, context: Context) {
        controller.onTextChange = { newText in
            if text != newText { text = newText }
        }
        controller.sync(text: text, config: config)
    }
}
