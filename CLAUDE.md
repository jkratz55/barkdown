# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Barkdown is a Typora-style live-preview Markdown editor for macOS: a native SwiftUI shell around a CodeMirror 6 editor running in a `WKWebView`.

## Commands

The active developer directory on this machine is the Command Line Tools, so prefix `xcodebuild` with `DEVELOPER_DIR` (or run `sudo xcode-select -s /Applications/Xcode.app`):

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild -project Barkdown.xcodeproj -scheme Barkdown -configuration Debug build
xcodebuild -project Barkdown.xcodeproj -scheme Barkdown test                                   # all tests
xcodebuild -project Barkdown.xcodeproj -scheme Barkdown test -only-testing:BarkdownTests/BarkdownTests/example   # one test
```

Tests use Swift Testing (`import Testing`, `@Test`). Right now they're only the template placeholders.

Releases: `scripts/release.sh [--draft] [--skip-publish] [version]` archives the app, exports it with Developer ID signing (`ExportOptions.plist`), builds `build/Barkdown-<version>.dmg`, then notarizes and staples it and publishes a GitHub release with `gh`. It needs the `barkdown-notary` notarytool keychain profile. The version defaults to `MARKETING_VERSION`.

The editor bundle has to be rebuilt after any change under `EditorWeb/src`:

```sh
cd EditorWeb && npm install && npm run build   # or npm run watch (unminified, rebuilds on save)
```

`build.mjs` (esbuild, IIFE, target safari17) writes `Barkdown/Editor/barkdown-editor.{html,js}` and copies Mermaid to `barkdown-mermaid.min.js`. Those outputs are checked in so Xcode builds without Node. Never edit them by hand. There is no linter configured.

## Project settings that matter

- macOS 27 deployment target, Swift 5 language mode, `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` with approachable concurrency. Types used off the main actor must be marked `nonisolated` (e.g. `FileKinds`).
- `MEMBER_IMPORT_VISIBILITY` is on, so each file must import the module it uses (e.g. `UniformTypeIdentifiers` for `UTType` members).
- Xcode uses file-system-synchronized groups: any file added under `Barkdown/` is compiled or bundled automatically. Don't edit `project.pbxproj` to add files.
- **App Sandbox is deliberately disabled** (`ENABLE_APP_SANDBOX = NO`), like Typora. The folder sidebar, relative image paths, saving images next to documents and running Pandoc all depend on it.

## Architecture

### Swift ↔ JS bridge

Each document window owns one `EditorController` (`Barkdown/Editor/EditorController.swift`). It creates the web view, loads `barkdown-editor.html` and exposes the controller to menus through `FocusedValues.editor` (defined in `Commands/BarkdownCommands.swift`).

- **Swift → JS:** calls go to the global `window.barkdown` API defined at the bottom of `EditorWeb/src/main.js` (`init`, `setText`, `getText`, `setConfig`, `command`, `find`, `exportHTML`, `htmlToMarkdown`, …), using `callAsyncJavaScript` with arguments. Menu items run named editor commands with `editor.run("<name>", args)`, and the names map through the `COMMANDS` table in `main.js` to functions in `src/commands.js`. A new formatting command needs entries in both places plus a menu item in `BarkdownCommands.swift`.
- **JS → Swift:** `webkit.messageHandlers.bridge` carries fire-and-forget events (`ready`, `change`, `outline`, `stats`, `activeHeading`, `openLink`, `log`), and `bridgeReply` handles request/response calls (`saveImage`, `copyText`).
- **Text sync:** the document's text lives in `MarkdownDocument` (a SwiftUI `FileDocument`). `EditorWebView` pushes it in through `controller.sync(text:config:)`, which skips echoes using `lastSyncedText`. JS sends edits back with a 40 ms debounce. Before anything reads the latest text (save, export), call `flush`/`currentText`.
- **Config:** `EditorConfig` (Swift, `Equatable`) is turned into a dictionary for `setConfig`. It is built from `Preferences.shared` + `ThemeManager.shared` + the document URL (whose folder is the base URL for relative images). A new user preference has to be added in `Preferences.swift`, `EditorConfig.swift`, the JS config handling in `main.js`, and `SettingsView.swift`.
- **Key handling:** shortcuts that belong to native menus are filtered out of CodeMirror's keymap (the `NATIVE` set in `main.js`). Undo/redo route to JS only when the editor has focus.

### Live preview (EditorWeb/src)

- `syntax.js` adds custom Lezer Markdown extensions (highlight `==`, inline/block `$` math, YAML front matter, footnote refs). Two non-obvious points: `cx.depth` equals the block stack length (don't add 1), and `FrontMatter` reads the private `cx.input` to look ahead.
- `livepreview.js` has two parts. A `ViewPlugin` adds inline/line decorations over the visible ranges, hiding markup unless the selection touches that node. A `StateField` holds the block widgets that replace whole ranges: tables, math, Mermaid, HTML blocks, `[toc]`. Widget classes are in `widgets.js`. `table.js` is the editable grid widget (`contenteditable="plaintext-only"` cells that serialize back to padded Markdown).
- Export goes through a separate pipeline in `render.js`: markdown-it plus plugins and a shared Lezer highlighter. It produces the HTML used for HTML/PDF/PNG/Word export and print, so a new syntax feature usually needs support in **both** the Lezer extension and the markdown-it renderer.
- Styling: `styles/document.css` holds the theme CSS variables and `.markdown-body`, shared by editor widgets and exports. `styles/editor.css` holds the editor chrome, and its selectors are prefixed `.cm-editor.bd-editor` so they win over CodeMirror's base theme. Built-in themes in `themes.js` are only variable sets. Their Swift metadata (name, darkness, swatch) is in `Settings/ThemeManager.swift`, so the two lists must stay in sync. User themes are CSS files in `~/Library/Application Support/Barkdown/Themes`.

### Native side

- `Views/DocumentWindow.swift` contains the `NavigationSplitView` (sidebar + editor), the toolbar, the sheets (Quick Open, Insert Table), and window setup: native tabbing through `Workspace.tabParent`, and `preferredColorScheme` taken from the theme's darkness, because SwiftUI otherwise resets the window appearance.
- `Workspace/Workspace.swift`: `Workspace.shared` holds the open folder root, and `FolderModel` holds the file tree, article list, search and FSEvents watching for that folder.
- `Export/`: `Exporter` asks JS for HTML and then converts it. PDF and print go through `OffscreenRenderer` (a hidden `WKWebView` + `NSPrintOperation`; page margins come from `NSPrintInfo`, so don't add `@page` margins in CSS). PNG uses `WKWebView.pdf` rasterized at 2×. docx/odt/rtf go through `NSAttributedString` from HTML. The other formats use Pandoc if it's installed.
- The app icon is `Barkdown/AppIcon.icon`, an Icon Composer document. It contains `icon.json`, which lists the groups front-to-back with the background fill, and `Assets/*.svg`, which are layers on a 1024×1024 canvas. The SVGs must not contain `<text>`, so use paths instead. To preview a change without opening Icon Composer, run `"/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool" Barkdown/AppIcon.icon --export-image --output-file out.png --platform macOS --rendition Default --width 1024 --height 1024 --scale 1`. Other `--rendition` values are `Dark`, `ClearLight` and `TintedDark`.
- `Help/Barkdown Guide.md` is a bundled showcase document that uses every feature, which makes it a good manual regression test for rendering.

### Debugging the web view

In DEBUG builds the web view is `isInspectable`, so Safari ▸ Develop can attach to it. Uncaught JS errors, unhandled rejections and `console.error` calls are forwarded to Swift through the `log` bridge message.
