// Focus mode, typewriter mode and document statistics.
import { ViewPlugin, Decoration, EditorView } from "@codemirror/view"
import { syntaxTree } from "@codemirror/language"

const FOCUS_BLOCKS = new Set([
  "Paragraph", "FencedCode", "CodeBlock", "Table", "BlockMath", "HTMLBlock", "HorizontalRule",
  "LinkReference", "FrontMatter", "ATXHeading1", "ATXHeading2", "ATXHeading3", "ATXHeading4",
  "ATXHeading5", "ATXHeading6", "SetextHeading1", "SetextHeading2", "CommentBlock",
])

function focusRange(state) {
  const head = state.selection.main.head
  for (const side of [-1, 1]) {
    for (let n = syntaxTree(state).resolveInner(head, side); n; n = n.parent) {
      if (FOCUS_BLOCKS.has(n.name)) return [n.from, n.to]
    }
  }
  const l = state.doc.lineAt(head)
  return [l.from, l.to]
}

const focusLine = Decoration.line({ class: "md-focus" })

export const focusMode = [
  EditorView.editorAttributes.of({ class: "bd-focus-mode" }),
  ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = this.build(view) }
    update(u) { if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = this.build(u.view) }
    build(view) {
      const { state } = view
      const [from, to] = focusRange(state)
      const out = []
      for (let pos = from; pos <= to;) {
        const l = state.doc.lineAt(pos)
        out.push(focusLine.range(l.from))
        pos = l.to + 1
      }
      return Decoration.set(out)
    }
  }, { decorations: (v) => v.decorations }),
]

export const typewriterMode = [
  EditorView.editorAttributes.of({ class: "bd-typewriter" }),
  EditorView.updateListener.of((u) => {
    if (!u.selectionSet && !u.docChanged) return
    if (u.transactions.some((t) => t.isUserEvent("select.pointer"))) return
    const head = u.state.selection.main.head
    requestAnimationFrame(() => {
      u.view.dispatch({ effects: EditorView.scrollIntoView(head, { y: "center" }) })
    })
  }),
]

// ---------- Statistics ----------

const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/g

function prose(text) {
  return text
    .replace(/^---\s*\n[\s\S]*?\n(---|\.\.\.)\s*(\n|$)/, "")
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/^```.*$/gm, ""))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*_~=`|#>$^]/g, " ")
}

export function countWords(text) {
  const p = prose(text)
  const cjk = (p.match(CJK) || []).length
  const words = (p.replace(CJK, " ").match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []).length
  return { words: words + cjk, cjk }
}

export function documentStats(state) {
  const text = state.doc.toString()
  const { words, cjk } = countWords(text)
  const chars = text.length
  const charsNoSpaces = text.replace(/\s/g, "").length
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length
  const minutes = Math.max(1, Math.round((words - cjk) / 230 + cjk / 400))
  const sel = state.selection.main
  let selection = null
  if (!sel.empty) {
    const s = state.sliceDoc(sel.from, sel.to)
    selection = { words: countWords(s).words, chars: s.length }
  }
  return { words, chars, charsNoSpaces, lines: state.doc.lines, paragraphs, readingMinutes: words ? minutes : 0, selection }
}
