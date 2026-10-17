//
//  StatusPill.swift
//  Barkdown
//

import SwiftUI

/// A small floating counter in the corner of the editor, like Typora's word count.
struct StatusPill: View {
    let editor: EditorController
    @State private var showDetails = false
    @State private var hovering = false
    private var prefs = Preferences.shared

    init(editor: EditorController) {
        self.editor = editor
    }

    private var stats: DocumentStats { editor.stats }

    private var summary: String {
        if let words = stats.selectionWords {
            return "\(words.formatted()) of \(stats.words.formatted()) words"
        }
        return stats.words == 1 ? "1 word" : "\(stats.words.formatted()) words"
    }

    var body: some View {
        HStack(spacing: 2) {
            if hovering || prefs.focusMode || prefs.typewriterMode || editor.sourceMode {
                modeButton("scope", "Focus Mode (F8)", prefs.focusMode) { prefs.focusMode.toggle() }
                modeButton("text.line.first.and.arrowtriangle.forward", "Typewriter Mode (F9)", prefs.typewriterMode) { prefs.typewriterMode.toggle() }
                modeButton("chevron.left.forwardslash.chevron.right", "Source Code Mode (⌘/)", editor.sourceMode) { editor.sourceMode.toggle() }
                Divider().frame(height: 12).padding(.horizontal, 3)
            }
            Button {
                showDetails.toggle()
            } label: {
                Text(summary)
                    .font(.system(size: 11.5, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .popover(isPresented: $showDetails, arrowEdge: .top) {
                StatsDetails(stats: stats)
            }
        }
        .padding(.horizontal, 4)
        .glassEffect(.regular, in: .capsule)
        .onHover { h in withAnimation(.easeOut(duration: 0.15)) { hovering = h } }
    }

    private func modeButton(_ symbol: String, _ help: String, _ on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .medium))
                .frame(width: 24, height: 22)
                .foregroundStyle(on ? Color.accentColor : Color.secondary)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(help)
    }
}

private struct StatsDetails: View {
    let stats: DocumentStats

    var body: some View {
        Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 6) {
            row("Words", stats.words)
            row("Characters", stats.characters)
            row("Characters (no spaces)", stats.charactersNoSpaces)
            row("Paragraphs", stats.paragraphs)
            row("Lines", stats.lines)
            GridRow {
                Text("Reading time").foregroundStyle(.secondary)
                Text(stats.readingMinutes == 0 ? "—" : "\(stats.readingMinutes) min").monospacedDigit()
            }
            if let words = stats.selectionWords, let chars = stats.selectionCharacters {
                Divider().gridCellColumns(2)
                row("Selected words", words)
                row("Selected characters", chars)
            }
        }
        .font(.system(size: 12))
        .padding(14)
    }

    private func row(_ title: String, _ value: Int) -> some View {
        GridRow {
            Text(title).foregroundStyle(.secondary)
            Text(value.formatted()).monospacedDigit()
        }
    }
}
