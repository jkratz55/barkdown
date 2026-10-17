# Barkdown

A Typora-style Markdown editor for macOS. Markdown renders as you type; move the cursor into styled text and its syntax appears so you can edit it.

## Layout

- `Barkdown/` — the SwiftUI app (document windows, sidebar, menus, settings, export).
- `Barkdown/Editor/barkdown-*.{html,js}` — the **built** editor bundle that ships in the app. Don't edit these by hand.
- `EditorWeb/` — the editor's source: CodeMirror 6 with a live-preview layer, KaTeX math, Mermaid diagrams, editable tables, and the themes.

## Building

Open `Barkdown.xcodeproj` and run. The built editor bundle is checked in, so Node isn't needed for a normal build.

After changing anything in `EditorWeb/src`, rebuild the bundle:

```sh
cd EditorWeb
npm install
npm run build      # or: npm run watch
```

## Notes

- The app is **not sandboxed**, like Typora. That's what lets the sidebar browse any folder, images load from relative paths, pasted images be saved next to documents, and Pandoc run for extra export formats.
- Custom themes are CSS files in `~/Library/Application Support/Barkdown/Themes` (Themes ▸ Open Theme Folder). The README there lists the CSS variables.
