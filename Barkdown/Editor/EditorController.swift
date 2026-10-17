//
//  EditorController.swift
//  Barkdown
//

import AppKit
import WebKit
import Observation
import UniformTypeIdentifiers

struct OutlineItem: Identifiable, Hashable {
    let id: Int
    let level: Int
    let text: String
    let pos: Int
    let line: Int
}

struct DocumentStats: Equatable {
    var words = 0
    var characters = 0
    var charactersNoSpaces = 0
    var lines = 0
    var paragraphs = 0
    var readingMinutes = 0
    var selectionWords: Int?
    var selectionCharacters: Int?
}

/// One per document window: owns the editor web view and exposes the editor's
/// state (outline, statistics) and commands to SwiftUI and the menus.
@Observable
final class EditorController: NSObject {
    // State published to the UI
    private(set) var isReady = false
    private(set) var outline: [OutlineItem] = []
    private(set) var activeHeading: Int = -1
    private(set) var stats = DocumentStats()
    var sourceMode = false
    var sidebarVisible = Preferences.shared.showSidebar
    var sidebarTab: SidebarTab = Preferences.shared.sidebarTab
    var showQuickOpen = false
    var showInsertTable = false
    var isFloating = false {
        didSet { window?.level = isFloating ? .floating : .normal }
    }

    // Document context
    var fileURL: URL?
    weak var window: NSWindow?
    /// Opens a new untitled document; provided by the window (SwiftUI's `newDocument`).
    var openNewDocument: ((String) -> Void)?
    /// Opens a file as a document; provided by the window (SwiftUI's `openDocument`).
    var openFile: ((URL) -> Void)?

    @ObservationIgnored private(set) var webView: BarkdownWebView?
    @ObservationIgnored var onTextChange: ((String) -> Void)?
    @ObservationIgnored private var lastSyncedText = ""
    @ObservationIgnored private var lastConfig: EditorConfig?
    @ObservationIgnored private var pendingText: String?
    @ObservationIgnored private var pendingFind: String?

    // MARK: Web view

    func makeWebView() -> BarkdownWebView {
        if let webView { return webView }
        let configuration = WKWebViewConfiguration()
        let proxy = ScriptHandlerProxy(self)
        configuration.userContentController.add(proxy, name: "bridge")
        configuration.userContentController.addScriptMessageHandler(proxy, contentWorld: .page, name: "bridgeReply")
        configuration.suppressesIncrementalRendering = false
        configuration.preferences.isTextInteractionEnabled = true

        let webView = BarkdownWebView(frame: .zero, configuration: configuration)
        webView.controller = self
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        webView.allowsMagnification = false
        webView.allowsBackForwardNavigationGestures = false
        #if DEBUG
        webView.isInspectable = true
        #endif
        self.webView = webView

        if let url = Bundle.main.url(forResource: "barkdown-editor", withExtension: "html") {
            webView.loadFileURL(url, allowingReadAccessTo: URL(filePath: "/"))
        }
        return webView
    }

    /// Called by the representable on every SwiftUI update.
    func sync(text: String, config: EditorConfig) {
        guard isReady else {
            pendingText = text
            lastConfig = config
            return
        }
        if text != lastSyncedText {
            lastSyncedText = text
            call("barkdown.setText(text)", ["text": text])
        }
        if config != lastConfig {
            lastConfig = config
            call("barkdown.setConfig(config)", ["config": config.dictionary])
        }
    }

    private func editorDidLoad() {
        let text = pendingText ?? ""
        lastSyncedText = text
        let config = lastConfig?.dictionary ?? [:]
        Task {
            _ = try? await webView?.callAsyncJavaScript("barkdown.init(text, config)", arguments: ["text": text, "config": config], contentWorld: .page)
            isReady = true
            if let find = pendingFind {
                pendingFind = nil
                self.find(find)
            }
        }
    }

    // MARK: JavaScript calls

    func call(_ script: String, _ arguments: [String: Any] = [:]) {
        guard let webView else { return }
        Task {
            do {
                _ = try await webView.callAsyncJavaScript(script, arguments: arguments, contentWorld: .page)
            } catch {
                print("[Barkdown] JS error in \(script): \(error)")
            }
        }
    }

    func evaluate(_ script: String, _ arguments: [String: Any] = [:]) async -> Any? {
        guard let webView else { return nil }
        do {
            return try await webView.callAsyncJavaScript(script, arguments: arguments, contentWorld: .page)
        } catch {
            print("[Barkdown] JS error in \(script): \(error)")
            return nil
        }
    }

    func run(_ command: String, _ argument: Any? = nil) {
        call("barkdown.command(name, arg)", ["name": command, "arg": argument ?? NSNull()])
    }

    func focus() {
        if let webView { window?.makeFirstResponder(webView) }
        call("barkdown.focus()")
    }

    func scroll(to item: OutlineItem) {
        call("barkdown.scrollToPos(pos)", ["pos": item.pos])
        if let webView { window?.makeFirstResponder(webView) }
    }

    func find(_ text: String) {
        guard isReady else {
            pendingFind = text
            return
        }
        call("barkdown.find(text)", ["text": text])
    }

    func insertText(_ text: String) {
        call("barkdown.insertText(text)", ["text": text])
    }

    func insertImages(_ paths: [String], at point: NSPoint? = nil) {
        if let point {
            call("barkdown.insertImages(paths, x, y)", ["paths": paths, "x": point.x, "y": point.y])
        } else {
            call("barkdown.insertImages(paths, null, null)", ["paths": paths])
        }
    }

    /// Flushes pending edits to the document binding (used before export or save).
    func currentText() async -> String {
        (await evaluate("return barkdown.getText()") as? String) ?? lastSyncedText
    }

    func exportHTML(_ options: [String: Any]) async -> String? {
        await evaluate("return await barkdown.exportHTML(opts)", ["opts": options]) as? String
    }

    func htmlToMarkdown(_ html: String) async -> String? {
        await evaluate("return barkdown.htmlToMarkdown(html)", ["html": html]) as? String
    }

    var editorHasFocus: Bool {
        guard let webView, let responder = window?.firstResponder as? NSView else { return false }
        return responder === webView || responder.isDescendant(of: webView)
    }

    // MARK: Undo routing

    func undo() {
        if editorHasFocus { run("undo") } else { NSApp.sendAction(Selector(("undo:")), to: nil, from: nil) }
    }

    func redo() {
        if editorHasFocus { run("redo") } else { NSApp.sendAction(Selector(("redo:")), to: nil, from: nil) }
    }

    // MARK: Clipboard

    func copyAsHTML() {
        Task {
            guard let html = await evaluate("return barkdown.selectionHTML()") as? String,
                  let md = await evaluate("return barkdown.selectionMarkdown()") as? String else { return }
            let pb = NSPasteboard.general
            pb.clearContents()
            pb.setString(html, forType: .html)
            pb.setString(md, forType: .string)
        }
    }

    func copyAsMarkdown() {
        Task {
            guard let md = await evaluate("return barkdown.selectionMarkdown()") as? String else { return }
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(md, forType: .string)
        }
    }

    func pasteAsPlainText() {
        guard let text = NSPasteboard.general.string(forType: .string) else { return }
        insertText(text)
    }

    func insertHyperlink() {
        let clip = NSPasteboard.general.string(forType: .string)?.trimmingCharacters(in: .whitespacesAndNewlines)
        run("hyperlink", clip ?? NSNull())
    }

    func insertImageFromFile() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image]
        panel.allowsMultipleSelection = true
        panel.message = "Choose images to insert"
        let handle: (NSApplication.ModalResponse) -> Void = { [weak self] response in
            guard let self, response == .OK else { return }
            let paths = panel.urls.compactMap { ImageAssets.place(fileURL: $0, documentURL: self.fileURL) }
            self.insertImages(paths)
        }
        if let window { panel.beginSheetModal(for: window, completionHandler: handle) } else { handle(panel.runModal()) }
    }

    // MARK: Messages from JavaScript

    fileprivate func receive(_ body: [String: Any]) {
        guard let type = body["type"] as? String else { return }
        switch type {
        case "ready":
            editorDidLoad()
        case "change":
            guard let text = body["text"] as? String, text != lastSyncedText else { return }
            lastSyncedText = text
            onTextChange?(text)
        case "outline":
            let items = (body["items"] as? [[String: Any]]) ?? []
            let mapped = items.enumerated().map { i, item in
                OutlineItem(id: i, level: item["level"] as? Int ?? 1, text: item["text"] as? String ?? "",
                            pos: item["pos"] as? Int ?? 0, line: item["line"] as? Int ?? 0)
            }
            if mapped != outline { outline = mapped }
        case "activeHeading":
            activeHeading = body["index"] as? Int ?? -1
        case "stats":
            var s = DocumentStats()
            s.words = body["words"] as? Int ?? 0
            s.characters = body["chars"] as? Int ?? 0
            s.charactersNoSpaces = body["charsNoSpaces"] as? Int ?? 0
            s.lines = body["lines"] as? Int ?? 0
            s.paragraphs = body["paragraphs"] as? Int ?? 0
            s.readingMinutes = body["readingMinutes"] as? Int ?? 0
            if let sel = body["selection"] as? [String: Any] {
                s.selectionWords = sel["words"] as? Int
                s.selectionCharacters = sel["chars"] as? Int
            }
            if s != stats { stats = s }
        case "openLink":
            if let href = body["href"] as? String { openLink(href) }
        case "log":
            print("[Barkdown JS] \(body["level"] as? String ?? "log"): \(body["message"] as? String ?? "")")
        default:
            break
        }
    }

    fileprivate func reply(_ body: [String: Any]) async -> Any? {
        switch body["type"] as? String {
        case "saveImage":
            guard let base64 = body["data"] as? String, let data = Data(base64Encoded: base64) else { return nil }
            let name = body["name"] as? String ?? "image.png"
            return ImageAssets.save(data: data, suggestedName: name, documentURL: fileURL)
        case "copyText":
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(body["text"] as? String ?? "", forType: .string)
            return true
        default:
            return nil
        }
    }

    func openLink(_ href: String) {
        let trimmed = href.trimmingCharacters(in: .whitespaces)
        if let url = URL(string: trimmed), let scheme = url.scheme?.lowercased(), scheme != "file" {
            NSWorkspace.shared.open(url)
            return
        }
        if trimmed.lowercased().hasPrefix("www.") , let url = URL(string: "https://" + trimmed) {
            NSWorkspace.shared.open(url)
            return
        }
        // A local path, possibly relative to the document.
        var path = trimmed
        if let hash = path.firstIndex(of: "#") { path = String(path[..<hash]) }
        path = path.removingPercentEncoding ?? path
        let target: URL
        if path.hasPrefix("file://"), let url = URL(string: trimmed) {
            target = url
        } else if path.hasPrefix("/") {
            target = URL(filePath: path)
        } else if path.hasPrefix("~/") {
            target = URL(filePath: NSString(string: path).expandingTildeInPath)
        } else if let dir = fileURL?.deletingLastPathComponent() {
            target = dir.appending(path: path).standardizedFileURL
        } else {
            return
        }
        if FileKinds.isMarkdown(target) {
            openFile?(target)
        } else if FileManager.default.fileExists(atPath: target.path) {
            NSWorkspace.shared.open(target)
        } else {
            NSSound.beep()
        }
    }
}

// MARK: - WebKit delegates

extension EditorController: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .cancel }
        if navigationAction.navigationType == .other, url.isFileURL, url.lastPathComponent == "barkdown-editor.html" {
            return .allow
        }
        if navigationAction.navigationType == .linkActivated {
            openLink(url.absoluteString)
        }
        return .cancel
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // Reload and restore the last known text if WebKit's process goes away.
        isReady = false
        pendingText = lastSyncedText
        if let url = Bundle.main.url(forResource: "barkdown-editor", withExtension: "html") {
            webView.loadFileURL(url, allowingReadAccessTo: URL(filePath: "/"))
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { openLink(url.absoluteString) }
        return nil
    }
}

/// Breaks the retain cycle between WKUserContentController and the controller.
private final class ScriptHandlerProxy: NSObject, WKScriptMessageHandler, WKScriptMessageHandlerWithReply {
    weak var controller: EditorController?

    init(_ controller: EditorController) {
        self.controller = controller
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        controller?.receive(body)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void) {
        guard let body = message.body as? [String: Any], let controller else {
            replyHandler(nil, nil)
            return
        }
        Task {
            let result = await controller.reply(body)
            replyHandler(result ?? NSNull(), nil)
        }
    }
}
