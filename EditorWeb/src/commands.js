// Editing commands behind Typora's Paragraph and Format menus.
import { EditorSelection } from "@codemirror/state"
import { syntaxTree } from "@codemirror/language"
import { emptyTable, focusTableAt } from "./table.js"

const INLINE = {
  strong: { open: "**", close: "**", node: "StrongEmphasis" },
  emphasis: { open: "*", close: "*", node: "Emphasis" },
  code: { open: "`", close: "`", node: "InlineCode" },
  strike: { open: "~~", close: "~~", node: "Strikethrough" },
  highlight: { open: "==", close: "==", node: "Highlight" },
  superscript: { open: "^", close: "^", node: "Superscript" },
  subscript: { open: "~", close: "~", node: "Subscript" },
  math: { open: "$", close: "$", node: "InlineMath" },
  underline: { open: "<u>", close: "</u>" },
  comment: { open: "<!-- ", close: " -->" },
}

const MARK_NAMES = new Set(["EmphasisMark", "CodeMark", "StrikethroughMark", "HighlightMark", "SuperscriptMark", "SubscriptMark", "InlineMathMark"])

function enclosing(state, pos, name) {
  for (let n = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) if (n.name === name) return n
  for (let n = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent) if (n.name === name) return n
  return null
}

function markChildren(node) {
  const out = []
  const c = node.cursor()
  if (c.firstChild()) do { if (MARK_NAMES.has(c.name)) out.push({ from: c.from, to: c.to }) } while (c.nextSibling())
  return out
}

export function toggleInline(view, kind) {
  const spec = INLINE[kind]
  if (!spec) return
  const { open, close, node: nodeName } = spec
  const { state } = view
  const tr = state.changeByRange((range) => {
    // Unwrap an existing node around the selection.
    if (nodeName) {
      const node = enclosing(state, range.from, nodeName)
      if (node && node.from <= range.from && node.to >= range.to) {
        const marks = markChildren(node)
        if (marks.length >= 2) {
          const first = marks[0], last = marks[marks.length - 1]
          const changes = [{ from: first.from, to: first.to }, { from: last.from, to: last.to }]
          const shift = first.to - first.from
          const map = (p) => Math.max(first.from, Math.min(p - shift, last.from - shift))
          return { changes, range: EditorSelection.range(map(range.anchor), map(range.head)) }
        }
      }
    }
    const text = state.sliceDoc(range.from, range.to)
    if (text.length >= open.length + close.length && text.startsWith(open) && text.endsWith(close)) {
      const inner = text.slice(open.length, text.length - close.length)
      return { changes: { from: range.from, to: range.to, insert: inner }, range: EditorSelection.range(range.from, range.from + inner.length) }
    }
    if (state.sliceDoc(range.from - open.length, range.from) === open && state.sliceDoc(range.to, range.to + close.length) === close && !nodeName) {
      return {
        changes: [{ from: range.from - open.length, to: range.from }, { from: range.to, to: range.to + close.length }],
        range: EditorSelection.range(range.from - open.length, range.to - open.length),
      }
    }
    if (range.empty) {
      const word = kind !== "math" && kind !== "comment" ? state.wordAt(range.head) : null
      if (word && word.from < range.head && word.to > range.head) {
        return {
          changes: [{ from: word.from, insert: open }, { from: word.to, insert: close }],
          range: EditorSelection.cursor(range.head + open.length),
        }
      }
      return { changes: { from: range.head, insert: open + close }, range: EditorSelection.cursor(range.head + open.length) }
    }
    return {
      changes: [{ from: range.from, insert: open }, { from: range.to, insert: close }],
      range: EditorSelection.range(range.from + open.length, range.to + open.length),
    }
  })
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: "input.format" }))
  view.focus()
}

// Lines covered by the selection, each once.
function selectedLines(state) {
  const seen = new Set(), lines = []
  for (const r of state.selection.ranges) {
    for (let pos = r.from; pos <= r.to;) {
      const l = state.doc.lineAt(pos)
      if (!seen.has(l.number)) { seen.add(l.number); lines.push(l) }
      pos = l.to + 1
    }
  }
  return lines
}

const QUOTE_PREFIX = /^(\s*(?:>\s?)*)/
const HEADING = /^(#{1,6})(?:\s+|$)/

function headingLevel(text) {
  const rest = text.replace(QUOTE_PREFIX, "")
  const m = HEADING.exec(rest)
  return m ? m[1].length : 0
}

function setLineHeading(line, level) {
  const prefix = QUOTE_PREFIX.exec(line.text)[1]
  const rest = line.text.slice(prefix.length)
  const m = HEADING.exec(rest)
  const stripped = m ? rest.slice(m[0].length) : rest.replace(/^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, "")
  const insert = prefix + (level ? "#".repeat(level) + " " : "") + stripped
  return { from: line.from, to: line.to, insert }
}

export function setHeading(view, level, toggle = true) {
  const { state } = view
  const lines = selectedLines(state)
  const all = lines.every((l) => headingLevel(l.text) === level)
  const target = toggle && all && level !== 0 ? 0 : level
  const changes = lines.map((l) => setLineHeading(l, target))
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  view.dispatch({ changes, userEvent: "input.format", scrollIntoView: true })
  const newLine = view.state.doc.line(line.number)
  view.dispatch({ selection: { anchor: newLine.to } })
  view.focus()
}

export function shiftHeading(view, delta) {
  const { state } = view
  const lines = selectedLines(state)
  const changes = lines.map((l) => {
    const cur = headingLevel(l.text)
    // Increasing the level promotes (H3 → H2); a paragraph becomes H6, H6 demotes to a paragraph.
    let next
    if (delta > 0) next = cur === 0 ? 6 : Math.max(1, cur - 1)
    else next = cur === 0 ? 0 : cur === 6 ? 0 : cur + 1
    return setLineHeading(l, next)
  })
  view.dispatch({ changes, userEvent: "input.format" })
  view.focus()
}

export function toggleQuote(view) {
  const { state } = view
  const lines = selectedLines(state)
  const all = lines.every((l) => /^\s*>/.test(l.text) || !l.text.trim())
  const changes = lines.map((l) => {
    if (all) {
      const m = /^(\s*)>\s?/.exec(l.text)
      return m ? { from: l.from, to: l.from + m[0].length, insert: m[1] } : null
    }
    return { from: l.from, insert: "> " }
  }).filter(Boolean)
  view.dispatch({ changes, userEvent: "input.format" })
  view.focus()
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/

export function toggleList(view, kind) {
  const { state } = view
  const lines = selectedLines(state).filter((l, i, arr) => l.text.trim() || arr.length === 1)
  const is = (l) => {
    const m = LIST_RE.exec(l.text)
    if (!m) return false
    if (kind === "task") return !!m[3]
    if (kind === "ol") return /\d/.test(m[2]) && !m[3]
    return !/\d/.test(m[2]) && !m[3]
  }
  const all = lines.length && lines.every(is)
  let n = 0
  const changes = lines.map((l) => {
    const m = LIST_RE.exec(l.text)
    const indent = m ? m[1] : /^\s*/.exec(l.text)[0]
    const end = l.from + (m ? m[0].length : indent.length)
    if (all) return { from: l.from, to: end, insert: indent }
    n++
    const marker = kind === "ol" ? `${n}. ` : kind === "task" ? "- [ ] " : "- "
    return { from: l.from, to: end, insert: indent + marker }
  })
  view.dispatch({ changes, userEvent: "input.format" })
  view.focus()
}

// Inserts a block on its own line(s); `cursor` is the offset of the caret inside `text`.
function insertBlock(view, text, cursor = text.length) {
  const { state } = view
  const range = state.selection.main
  const line = state.doc.lineAt(range.head)
  let from, to, before = "", after = ""
  if (!line.text.trim()) {
    from = line.from; to = line.to
    if (line.number > 1 && state.doc.line(line.number - 1).text.trim()) before = "\n"
  } else {
    from = to = line.to
    before = "\n\n"
  }
  const nextLine = to < state.doc.length ? state.doc.lineAt(to + 1) : null
  if (nextLine && nextLine.text.trim()) after = "\n"
  const insert = before + text + after
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + before.length + cursor },
    scrollIntoView: true,
    userEvent: "input.insert",
  })
  view.focus()
  return from + before.length
}

function wrapLines(view, open, close, emptyCursorText = "") {
  const { state } = view
  const r = state.selection.main
  if (r.empty) {
    insertBlock(view, open + "\n" + emptyCursorText + "\n" + close, open.length + 1)
    return
  }
  const first = state.doc.lineAt(r.from), last = state.doc.lineAt(r.to)
  const body = state.sliceDoc(first.from, last.to)
  view.dispatch({
    changes: { from: first.from, to: last.to, insert: open + "\n" + body + "\n" + close },
    selection: { anchor: first.from + open.length },
    userEvent: "input.format",
  })
  view.focus()
}

export function codeFence(view, lang = "") { wrapLines(view, "```" + lang, "```") }
export function mathBlock(view) { wrapLines(view, "$$", "$$") }

export function insertTable(view, rows = 3, cols = 3) {
  const text = emptyTable(Math.max(2, rows), Math.max(1, cols))
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  const prevFilled = line.number > 1 && state.doc.line(line.number - 1).text.trim()
  const at = line.text.trim() ? line.to + 2 : line.from + (prevFilled ? 1 : 0)
  focusTableAt(at)
  insertBlock(view, text + "\n", text.length + 1)
}

export function horizontalRule(view) { insertBlock(view, "---\n\n", 5) }
export function tableOfContents(view) { insertBlock(view, "[toc]\n\n", 7) }

export function frontMatter(view) {
  const text = view.state.doc.toString()
  if (/^---\s*\n/.test(text)) {
    view.dispatch({ selection: { anchor: 4 }, scrollIntoView: true })
  } else {
    view.dispatch({ changes: { from: 0, insert: "---\n\n---\n\n" }, selection: { anchor: 4 }, scrollIntoView: true, userEvent: "input.insert" })
  }
  view.focus()
}

export function footnote(view) {
  const { state } = view
  const text = state.doc.toString()
  let max = 0
  for (const m of text.matchAll(/\[\^(\d+)\]/g)) max = Math.max(max, Number(m[1]))
  const label = String(max + 1)
  const pos = state.selection.main.to
  const end = state.doc.length
  const tail = (text.endsWith("\n") ? "\n" : "\n\n") + `[^${label}]: `
  view.dispatch({
    changes: [{ from: pos, insert: `[^${label}]` }, { from: end, insert: tail }],
    selection: { anchor: end + `[^${label}]`.length + tail.length },
    scrollIntoView: true,
    userEvent: "input.insert",
  })
  view.focus()
}

export function linkReference(view) {
  const pos = insertBlock(view, "[]: ", 1)
  void pos
}

export function hyperlink(view, clipboardURL) {
  const { state } = view
  const r = state.selection.main
  const text = state.sliceDoc(r.from, r.to)
  const node = (() => { for (let n = syntaxTree(state).resolveInner(r.head, -1); n; n = n.parent) if (n.name === "Link") return n; return null })()
  if (node) {
    // Already a link: unlink, keeping its text.
    const marks = node.getChildren("LinkMark")
    if (marks.length >= 2) {
      const inner = state.sliceDoc(marks[0].to, marks[1].from)
      view.dispatch({ changes: { from: node.from, to: node.to, insert: inner }, selection: { anchor: node.from, head: node.from + inner.length }, userEvent: "input.format" })
      view.focus()
      return
    }
  }
  const isURL = (s) => /^(https?:\/\/|mailto:|www\.)\S+$/i.test(s)
  if (!r.empty && isURL(text)) {
    view.dispatch({ changes: { from: r.from, to: r.to, insert: `[](${text})` }, selection: { anchor: r.from + 1 }, userEvent: "input.format" })
  } else if (!r.empty) {
    const url = clipboardURL && isURL(clipboardURL) ? clipboardURL : ""
    const insert = `[${text}](${url})`
    const anchor = url ? r.from + insert.length : r.from + text.length + 3
    view.dispatch({ changes: { from: r.from, to: r.to, insert }, selection: { anchor }, userEvent: "input.format" })
  } else {
    const url = clipboardURL && isURL(clipboardURL) ? clipboardURL : ""
    view.dispatch({ changes: { from: r.from, insert: `[](${url})` }, selection: { anchor: r.from + 1 }, userEvent: "input.format" })
  }
  view.focus()
}

export function image(view, src = "") {
  const { state } = view
  const r = state.selection.main
  const alt = state.sliceDoc(r.from, r.to)
  const insert = `![${alt}](${src})`
  const anchor = src ? r.from + 2 + alt.length : r.from + insert.length - 1
  view.dispatch({ changes: { from: r.from, to: r.to, insert }, selection: { anchor }, userEvent: "input.insert" })
  view.focus()
}

export function insertImages(view, paths, pos) {
  if (!paths.length) return
  const at = pos ?? view.state.selection.main.head
  const line = view.state.doc.lineAt(at)
  const pre = line.text.trim() && at === line.to ? "\n" : ""
  const insert = pre + paths.map((p) => `![](${encodeImagePath(p)})`).join("\n")
  view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length }, scrollIntoView: true, userEvent: "input.insert" })
  view.focus()
}

export function encodeImagePath(p) {
  if (/^(https?:|data:)/i.test(p)) return p
  return p.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29")
}

export function clearFormat(view) {
  const { state } = view
  const changes = []
  for (const r of state.selection.ranges) {
    if (r.empty) continue
    syntaxTree(state).iterate({
      from: r.from, to: r.to,
      enter(node) {
        if (node.from < r.from || node.to > r.to) return
        if (MARK_NAMES.has(node.name) && node.node.parent?.name !== "FencedCode") changes.push({ from: node.from, to: node.to })
        else if (node.name === "Link") {
          const marks = node.node.getChildren("LinkMark")
          if (marks.length >= 2) {
            changes.push({ from: node.from, to: marks[0].to })
            changes.push({ from: marks[1].from, to: node.to })
          }
          return false
        } else if (node.name === "HTMLTag" && /^<\/?(u|mark|span|font|b|i|em|strong|sup|sub|small|ins)\b/i.test(state.sliceDoc(node.from, node.to))) {
          changes.push({ from: node.from, to: node.to })
        }
      },
    })
  }
  if (changes.length) view.dispatch({ changes, userEvent: "input.format" })
  view.focus()
}

export function insertParagraph(view, below) {
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.head)
  if (below) view.dispatch({ changes: { from: line.to, insert: "\n\n" }, selection: { anchor: line.to + 2 }, scrollIntoView: true })
  else view.dispatch({ changes: { from: line.from, insert: "\n\n" }, selection: { anchor: line.from }, scrollIntoView: true })
  view.focus()
}
