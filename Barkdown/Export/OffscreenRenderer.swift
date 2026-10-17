//
//  OffscreenRenderer.swift
//  Barkdown
//

import AppKit
import WebKit

/// Lays out exported HTML in a hidden web view to print it, paginate it to PDF,
/// or capture it as an image.
final class OffscreenRenderer: NSObject, WKNavigationDelegate {
    private let webView: WKWebView
    private let window: NSWindow
    private var loadContinuation: CheckedContinuation<Void, Never>?
    private var printContinuation: CheckedContinuation<Bool, Never>?
    private var tempFile: URL?

    init(width: CGFloat = 860) {
        let configuration = WKWebViewConfiguration()
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: 1200), configuration: configuration)
        window = NSWindow(contentRect: NSRect(x: -20000, y: -20000, width: width, height: 1200),
                          styleMask: [.borderless], backing: .buffered, defer: false)
        super.init()
        window.isReleasedWhenClosed = false
        window.contentView = webView
        webView.navigationDelegate = self
    }

    deinit {
        if let tempFile { try? FileManager.default.removeItem(at: tempFile) }
    }

    func load(html: String) async {
        let url = FileManager.default.temporaryDirectory.appending(path: "barkdown-export-\(UUID().uuidString).html")
        try? html.write(to: url, atomically: true, encoding: .utf8)
        tempFile = url
        await withCheckedContinuation { continuation in
            loadContinuation = continuation
            webView.loadFileURL(url, allowingReadAccessTo: URL(filePath: "/"))
        }
        // Wait for images and fonts before measuring or printing.
        _ = try? await webView.callAsyncJavaScript("""
            await Promise.all([...document.images].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r })));
            await document.fonts.ready;
            return true;
            """, contentWorld: .page)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadContinuation?.resume()
        loadContinuation = nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        loadContinuation?.resume()
        loadContinuation = nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        loadContinuation?.resume()
        loadContinuation = nil
    }

    private func printInfo(paper: NSSize, marginMM: Double) -> NSPrintInfo {
        let info = (NSPrintInfo.shared.copy() as? NSPrintInfo) ?? NSPrintInfo()
        let margin = CGFloat(marginMM / 25.4 * 72)
        info.paperSize = paper
        info.topMargin = margin
        info.bottomMargin = margin
        info.leftMargin = margin
        info.rightMargin = margin
        info.horizontalPagination = .automatic
        info.verticalPagination = .automatic
        info.isHorizontallyCentered = false
        info.isVerticallyCentered = false
        return info
    }

    /// Paginated PDF written to `url`.
    func writePDF(to url: URL, paper: NSSize, marginMM: Double, parent: NSWindow?) async -> Bool {
        let info = printInfo(paper: paper, marginMM: marginMM)
        info.jobDisposition = .save
        info.dictionary()[NSPrintInfo.AttributeKey.jobSavingURL] = url
        return await run(info: info, showPanels: false, parent: parent)
    }

    /// Shows the system print panel.
    func print(paper: NSSize, marginMM: Double, parent: NSWindow?) async {
        _ = await run(info: printInfo(paper: paper, marginMM: marginMM), showPanels: true, parent: parent)
    }

    private func run(info: NSPrintInfo, showPanels: Bool, parent: NSWindow?) async -> Bool {
        let operation = webView.printOperation(with: info)
        operation.showsPrintPanel = showPanels
        operation.showsProgressPanel = showPanels
        operation.printPanel.options.insert([.showsPaperSize, .showsOrientation, .showsScaling])
        operation.view?.frame = webView.bounds
        let host = parent ?? window
        return await withCheckedContinuation { continuation in
            printContinuation = continuation
            operation.runModal(for: host, delegate: self, didRun: #selector(printOperationDidRun(_:success:contextInfo:)), contextInfo: nil)
        }
    }

    @objc private func printOperationDidRun(_ operation: NSPrintOperation, success: Bool, contextInfo: UnsafeMutableRawPointer?) {
        printContinuation?.resume(returning: success)
        printContinuation = nil
    }

    /// The whole page as a PNG, at 2× scale.
    func pngData() async -> Data? {
        let script = "const b = document.querySelector('.markdown-body'); return Math.ceil((b ? b.getBoundingClientRect().bottom + window.scrollY : document.body.scrollHeight) + 8)"
        let height = (try? await webView.callAsyncJavaScript(script, contentWorld: .page)) as? Double ?? 1200
        let size = NSSize(width: webView.frame.width, height: CGFloat(height))
        webView.setFrameSize(size)
        window.setContentSize(size)
        let config = WKPDFConfiguration()
        config.rect = CGRect(origin: .zero, size: size)
        guard let pdf = try? await webView.pdf(configuration: config),
              let rep = NSPDFImageRep(data: pdf) else { return nil }
        let scale: CGFloat = 2
        let pixels = NSSize(width: rep.bounds.width * scale, height: rep.bounds.height * scale)
        guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(pixels.width), pixelsHigh: Int(pixels.height),
                                            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                            colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { return nil }
        bitmap.size = rep.bounds.size
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        rep.draw(in: NSRect(origin: .zero, size: rep.bounds.size))
        NSGraphicsContext.restoreGraphicsState()
        return bitmap.representation(using: .png, properties: [:])
    }
}
