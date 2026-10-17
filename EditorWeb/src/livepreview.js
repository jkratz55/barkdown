// Live preview: renders Markdown in place and reveals the syntax of whatever
// the cursor touches, the way Typora's seamless editing does.
import { Decoration, ViewPlugin, EditorView } from "@codemirror/view"
import { StateField, StateEffect } from "@codemirror/state"
import { syntaxTree, ensureSyntaxTree } from "@codemirror/language"
import full from "markdown-it-emoji/lib/data/full.mjs"
import {
  ImageWidget, MathWidget, DiagramWidget, HRWidget, BulletWidget, CheckboxWidget,
  CodeHeaderWidget, TocWidget, HTMLWidget, TextWidget,
} from "./widgets.js"
import { TableWidget } from "./table.js"
import { env } from "./env.js"

export const refreshEffect = StateEffect.define()

const hide = Decoration.replace({})
const markCache = new Map()
const mark = (cls, attrs) => {
  if (attrs) return Decoration.mark({ class: cls, attributes: attrs })
  let d = markCache.get(cls)
  if (!d) markCache.set(cls, (d = Decoration.mark({ class: cls })))
  return d
}
const lineCache = new Map()
const line = (cls) => {
  let d = lineCache.get(cls)
  if (!d) lineCache.set(cls, (d = Decoration.line({ class: cls })))
  return d
}

const INLINE_STYLE = {
  Emphasis: "md-em",
  StrongEmphasis: "md-strong",
  Strikethrough: "md-del",
  Highlight: "md-mark",
  Superscript: "md-sup",
  Subscript: "md-sub",
  InlineCode: "md-code",
}
const INLINE_MARKS = new Set(["EmphasisMark", "StrikethroughMark", "HighlightMark", "SuperscriptMark", "SubscriptMark", "CodeMark"])

function touches(state, from, to) {
  for (const r of state.selection.ranges) if (r.from <= to && r.to >= from) return true
  return false
}

function lineTouched(state, pos) {
  const l = state.doc.lineAt(pos)
  return touches(state, l.from, l.to)
}

function codeInfo(state, node) {
  const info = node.getChild("CodeInfo")
  return info ? state.sliceDoc(info.from, info.to).trim().split(/\s+/)[0] : ""
}

function codeText(state, node) {
  const first = state.doc.lineAt(node.from)
  const last = state.doc.lineAt(node.to)
  const closed = last.number > first.number && /^\s*(```|~~~)/.test(last.text)
  const end = closed ? last.from - 1 : node.to
  return end > first.to ? state.sliceDoc(first.to + 1, end) : ""
}

function mathText(state, node) {
  const marks = node.getChildren("BlockMathMark")
  if (marks.length >= 2) return state.sliceDoc(marks[0].to, marks[marks.length - 1].from).replace(/^\n|\n$/g, "")
  return state.sliceDoc(marks.length ? marks[0].to : node.from, node.to).replace(/^\n/, "")
}

function isDiagram(lang) { return env.diagrams && /^mermaid$/i.test(lang) }
function isMathFence(lang) { return /^(math|latex|katex)$/i.test(lang) }

export function collectHeadings(state, tree = syntaxTree(state)) {
  const out = []
  const top = tree.topNode.cursor()
  if (!top.firstChild()) return out
  do {
    const m = /^(ATXHeading|SetextHeading)(\d)$/.exec(top.name)
    if (!m) continue
    const from = top.from
    const firstLine = state.doc.lineAt(from)
    let text = m[1] === "ATXHeading"
      ? firstLine.text.replace(/^\s{0,3}#{1,6}\s*/, "").replace(/\s+#+\s*$/, "")
      : state.sliceDoc(from, state.doc.lineAt(top.to).from - 1)
    text = plainInline(text)
    out.push({ level: Number(m[2]), text, pos: from, line: firstLine.number })
  } while (top.nextSibling())
  return out
}

export function plainInline(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/(\*\*|__|==|~~)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_](.+?)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!|~=$^])/g, "$1")
    .trim()
}

// ---------- Inline & line decorations (viewport only) ----------

function buildInline(view) {
  const { state } = view
  const tree = syntaxTree(state)
  const out = []
  const seenLines = new Set()
  const addLine = (pos, cls) => {
    const key = pos + ":" + cls
    if (seenLines.has(key)) return
    seenLines.add(key)
    out.push(line(cls).range(pos))
  }
  const linesOf = (from, to, fn) => {
    for (let pos = from; pos <= to;) {
      const l = state.doc.lineAt(pos)
      fn(l)
      pos = l.to + 1
    }
  }
  const sameLine = (a, b) => state.doc.lineAt(a).number === state.doc.lineAt(b).number
  const hideRange = (from, to) => { if (to > from && sameLine(from, to)) out.push(hide.range(from, to)) }
  const hideWithSpace = (from, to) => {
    const next = state.sliceDoc(to, to + 1)
    hideRange(from, next === " " || next === "\t" ? to + 1 : to)
  }
  let listDepth = 0

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from, to,
      enter(node) {
        const name = node.name
        const n = node.node

        if (name === "BulletList" || name === "OrderedList") { listDepth++; return }

        let m
        if ((m = /^ATXHeading(\d)$/.exec(name))) {
          addLine(state.doc.lineAt(node.from).from, `md-h md-h${m[1]}`)
          if (!lineTouched(state, node.from)) {
            for (const hm of n.getChildren("HeaderMark")) {
              if (hm.from === state.doc.lineAt(node.from).from || state.sliceDoc(hm.from - 1, hm.from) !== " ") hideWithSpace(hm.from, hm.to)
              else hideRange(hm.from - 1, hm.to)
            }
          } else {
            for (const hm of n.getChildren("HeaderMark")) out.push(mark("md-syntax md-header-mark").range(hm.from, hm.to))
          }
          return
        }
        if ((m = /^SetextHeading(\d)$/.exec(name))) {
          const hm = n.getChild("HeaderMark")
          const end = hm ? state.doc.lineAt(hm.from).from : node.to
          linesOf(node.from, Math.max(node.from, end - 1), (l) => addLine(l.from, `md-h md-h${m[1]}`))
          if (hm) {
            if (!touches(state, node.from, node.to)) {
              addLine(state.doc.lineAt(hm.from).from, "md-collapsed")
              hideRange(hm.from, hm.to)
            } else out.push(mark("md-syntax").range(hm.from, hm.to))
          }
          return
        }

        if (INLINE_STYLE[name]) {
          if (node.to > node.from) out.push(mark(INLINE_STYLE[name]).range(node.from, node.to))
          const active = touches(state, node.from, node.to)
          const c = n.cursor()
          if (c.firstChild()) do {
            if (INLINE_MARKS.has(c.name)) {
              if (active) out.push(mark("md-syntax").range(c.from, c.to))
              else hideRange(c.from, c.to)
            }
          } while (c.nextSibling())
          return name !== "InlineCode"
        }

        switch (name) {
          case "FrontMatter":
            linesOf(node.from, node.to, (l) => addLine(l.from, "md-frontmatter"))
            return false

          case "Blockquote": {
            if (n.parent && n.parent.name === "Blockquote") return
            linesOf(node.from, node.to, (l) => addLine(l.from, "md-quote"))
            return
          }
          case "QuoteMark":
            if (!lineTouched(state, node.from)) hideWithSpace(node.from, node.to)
            else out.push(mark("md-syntax").range(node.from, node.to))
            return

          case "ListMark": {
            const item = n.parent
            const task = item && item.getChild("Task")
            const marker = task && task.getChild("TaskMarker")
            const ordered = item && item.parent && item.parent.name === "OrderedList"
            if (marker) {
              if (!touches(state, node.from, marker.to)) hideRange(node.from, marker.from)
              else out.push(mark("md-syntax").range(node.from, node.to))
            } else if (ordered) {
              out.push(mark("md-list-num").range(node.from, node.to))
            } else if (!touches(state, node.from, node.to)) {
              out.push(Decoration.replace({ widget: new BulletWidget(Math.max(0, listDepth - 1)) }).range(node.from, node.to))
            } else out.push(mark("md-syntax").range(node.from, node.to))
            addLine(state.doc.lineAt(node.from).from, "md-li")
            return
          }
          case "TaskMarker": {
            const text = state.sliceDoc(node.from, node.to)
            const checked = /x/i.test(text)
            if (!touches(state, node.from, node.to)) {
              out.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(node.from, node.to))
            }
            if (checked && n.parent && node.to + 1 < n.parent.to) out.push(mark("md-task-done").range(node.to + 1, n.parent.to))
            return
          }

          case "HorizontalRule":
            addLine(state.doc.lineAt(node.from).from, "md-hr-line")
            if (!lineTouched(state, node.from)) out.push(Decoration.replace({ widget: new HRWidget() }).range(node.from, node.to))
            else out.push(mark("md-syntax").range(node.from, node.to))
            return false

          case "FencedCode": {
            const lang = codeInfo(state, n)
            const active = touches(state, node.from, node.to)
            if (!active && (isDiagram(lang) || isMathFence(lang))) return false
            const first = state.doc.lineAt(node.from), last = state.doc.lineAt(node.to)
            const closed = last.number > first.number && /^\s*(```|~~~)/.test(last.text)
            linesOf(node.from, node.to, (l) => {
              let cls = "md-codeblock"
              if (l.number === first.number) cls += " md-codeblock-begin"
              if (l.number === last.number) cls += " md-codeblock-end"
              addLine(l.from, cls)
            })
            if (!active) {
              out.push(Decoration.replace({ widget: new CodeHeaderWidget(lang, codeText(state, n)) }).range(node.from, first.to))
              const closing = n.lastChild
              if (closed && closing && closing.name === "CodeMark" && closing.from >= last.from) {
                addLine(last.from, "md-fence-collapsed")
                hideRange(closing.from, last.to)
              }
            } else {
              addLine(first.from, "md-fence")
              if (closed) addLine(last.from, "md-fence")
            }
            return false
          }
          case "CodeBlock":
            linesOf(node.from, node.to, (l) => addLine(l.from, "md-codeblock md-codeblock-indented"))
            return false

          case "BlockMath":
            if (touches(state, node.from, node.to)) {
              linesOf(node.from, node.to, (l) => addLine(l.from, "md-math-source"))
            }
            return false

          case "InlineMath": {
            if (!sameLine(node.from, node.to)) return false
            const marks = n.getChildren("InlineMathMark")
            const tex = state.sliceDoc(marks[0]?.to ?? node.from, marks[1]?.from ?? node.to)
            const display = marks[0] && marks[0].to - marks[0].from === 2
            if (!touches(state, node.from, node.to)) {
              out.push(Decoration.replace({ widget: new MathWidget(tex, display) }).range(node.from, node.to))
            } else {
              out.push(mark("md-math-src").range(node.from, node.to))
              out.push(Decoration.widget({ widget: new MathWidget(tex, false, true), side: 1 }).range(node.to))
            }
            return false
          }

          case "Link": {
            const marks = n.getChildren("LinkMark")
            const url = n.getChild("URL")
            const label = n.getChild("LinkLabel")
            if (marks.length < 2 || (!url && !label)) return
            const textFrom = marks[0].to, textTo = marks[1].from
            const href = url ? state.sliceDoc(url.from, url.to) : ""
            const attrs = { "data-href": href }
            if (textTo > textFrom) out.push(mark("md-link", attrs).range(textFrom, textTo))
            if (!touches(state, node.from, node.to)) {
              hideRange(node.from, textFrom)
              hideRange(textTo, node.to)
            } else {
              out.push(mark("md-syntax").range(node.from, textFrom))
              out.push(mark("md-syntax md-url").range(textTo, node.to))
            }
            return
          }
          case "Image": {
            const marks = n.getChildren("LinkMark")
            const url = n.getChild("URL")
            const titleNode = n.getChild("LinkTitle")
            const alt = marks.length >= 2 ? state.sliceDoc(marks[0].to, marks[1].from) : ""
            const src = url ? state.sliceDoc(url.from, url.to).replace(/^<|>$/g, "") : ""
            const title = titleNode ? state.sliceDoc(titleNode.from + 1, titleNode.to - 1) : ""
            if (!sameLine(node.from, node.to)) return false
            const l = state.doc.lineAt(node.from)
            const block = l.text.trim() === state.sliceDoc(node.from, node.to).trim()
            if (!touches(state, node.from, node.to)) {
              if (block) addLine(l.from, "md-image-line")
              out.push(Decoration.replace({ widget: new ImageWidget(src, alt, title, { block }) }).range(node.from, node.to))
            } else {
              out.push(mark("md-syntax md-image-src").range(node.from, node.to))
              if (src) out.push(Decoration.widget({ widget: new ImageWidget(src, alt, title, { preview: true }), side: 1 }).range(node.to))
            }
            return false
          }
          case "Autolink": {
            const url = n.getChild("URL")
            if (url) out.push(mark("md-link", { "data-href": state.sliceDoc(url.from, url.to) }).range(url.from, url.to))
            if (!touches(state, node.from, node.to)) {
              for (const lm of n.getChildren("LinkMark")) hideRange(lm.from, lm.to)
            }
            return false
          }
          case "URL": {
            const p = n.parent?.name
            if (p !== "Link" && p !== "Image" && p !== "Autolink" && p !== "LinkReference") {
              const href = state.sliceDoc(node.from, node.to)
              out.push(mark("md-link md-bare-link", { "data-href": /^www\./i.test(href) ? "https://" + href : href }).range(node.from, node.to))
            }
            return
          }
          case "LinkReference": {
            const label = n.getChild("LinkLabel")
            const isNote = label && state.sliceDoc(label.from, label.from + 2) === "[^"
            linesOf(node.from, node.to, (l) => addLine(l.from, isNote ? "md-footnote-def" : "md-linkref"))
            if (isNote && !touches(state, label.from, label.to + 1) && state.sliceDoc(label.to, label.to + 1) === ":") {
              const name = state.sliceDoc(label.from + 2, label.to - 1)
              out.push(Decoration.replace({ widget: new TextWidget(name, "md-footnote-label") }).range(label.from, label.to + 1))
            }
            return false
          }
          case "FootnoteRef": {
            const lbl = n.getChild("FootnoteLabel")
            if (lbl) out.push(mark("md-footnote-ref", { "data-footnote": state.sliceDoc(lbl.from, lbl.to) }).range(lbl.from, lbl.to))
            if (!touches(state, node.from, node.to)) {
              for (const fm of n.getChildren("FootnoteMark")) hideRange(fm.from, fm.to)
            } else for (const fm of n.getChildren("FootnoteMark")) out.push(mark("md-syntax").range(fm.from, fm.to))
            return false
          }
          case "Emoji": {
            const code = state.sliceDoc(node.from + 1, node.to - 1)
            const ch = full[code]
            if (ch && !touches(state, node.from, node.to)) {
              out.push(Decoration.replace({ widget: new TextWidget(ch, "md-emoji") }).range(node.from, node.to))
            }
            return false
          }
          case "Escape":
            if (!touches(state, node.from, node.to)) hideRange(node.from, node.from + 1)
            return false
          case "HTMLBlock":
          case "CommentBlock":
            if (name === "CommentBlock" || touches(state, node.from, node.to)) {
              linesOf(node.from, node.to, (l) => addLine(l.from, name === "CommentBlock" ? "md-comment" : "md-html-source"))
            }
            return false
          case "Comment":
            out.push(mark("md-comment").range(node.from, node.to))
            return false
          case "HTMLTag":
            out.push(mark("md-syntax md-html-tag").range(node.from, node.to))
            return false
          case "Table":
            return false
        }
      },
      leave(node) {
        if (node.name === "BulletList" || node.name === "OrderedList") listDepth--
      },
    })
  }

  // Inline HTML that Typora renders: <u>, <mark>, <kbd>, <sup>, <sub>, <ins>, <small>.
  for (const { from, to } of view.visibleRanges) {
    const text = state.sliceDoc(from, to)
    const re = /<(u|mark|kbd|sup|sub|ins|small)>([^<\n]+?)<\/\1>/g
    let m
    while ((m = re.exec(text))) {
      const start = from + m.index, end = start + m[0].length
      const node = tree.resolveInner(start, 1)
      if (/Code|Comment/.test(node.name) || /Code/.test(node.parent?.name || "")) continue
      const openEnd = start + m[1].length + 2, closeStart = end - m[1].length - 3
      out.push(mark("md-html-" + m[1]).range(openEnd, closeStart))
      if (!touches(state, start, end)) {
        out.push(hide.range(start, openEnd))
        out.push(hide.range(closeStart, end))
      }
    }
  }

  // Blank lines between paragraphs read as spacing, not as full empty lines.
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const l = state.doc.lineAt(pos)
      if (!l.text.trim() && !seenLines.has(l.from + ":md-codeblock") && !touches(state, l.from, l.to)) {
        const node = tree.resolveInner(l.from, 1)
        if (!/Code|Math|HTML|FrontMatter/.test(node.name)) out.push(line("md-blank").range(l.from))
      }
      pos = l.to + 1
    }
  }

  return Decoration.set(out.filter((r) => r.from <= r.to), true)
}

export const inlinePreview = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = buildInline(view) }
  update(u) {
    if (u.docChanged || u.selectionSet || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state) ||
        u.transactions.some((t) => t.effects.some((e) => e.is(refreshEffect)))) {
      this.decorations = buildInline(u.view)
    }
  }
}, { decorations: (v) => v.decorations })

// ---------- Block widgets (whole document; may span lines) ----------

function strictlyInside(state, from, to) {
  for (const r of state.selection.ranges) if (r.from > from && r.to < to) return true
  return false
}

function buildBlocks(state) {
  const tree = ensureSyntaxTree(state, state.doc.length, 200) || syntaxTree(state)
  const out = []
  let headings = null
  tree.iterate({
    enter(node) {
      switch (node.name) {
        case "Document": case "BulletList": case "OrderedList": case "ListItem": case "Blockquote":
          return
        case "Table": {
          const src = state.sliceDoc(node.from, node.to)
          if (!strictlyInside(state, node.from, node.to)) {
            out.push(Decoration.replace({ widget: new TableWidget(src), block: true }).range(node.from, node.to))
          }
          return false
        }
        case "FencedCode": {
          const n = node.node
          const lang = codeInfo(state, n)
          const diagram = isDiagram(lang), math = isMathFence(lang)
          if (!diagram && !math) return false
          const code = codeText(state, n)
          const widget = (preview) => diagram ? new DiagramWidget(code, preview) : new MathWidget(code, true, preview)
          if (!touches(state, node.from, node.to)) {
            out.push(Decoration.replace({ widget: widget(false), block: true }).range(node.from, node.to))
          } else if (code.trim()) {
            out.push(Decoration.widget({ widget: widget(true), block: true, side: 1 }).range(node.to))
          }
          return false
        }
        case "BlockMath": {
          const tex = mathText(state, node.node)
          if (!touches(state, node.from, node.to)) {
            out.push(Decoration.replace({ widget: new MathWidget(tex, true), block: true }).range(node.from, node.to))
          } else if (tex.trim()) {
            out.push(Decoration.widget({ widget: new MathWidget(tex, true, true), block: true, side: 1 }).range(node.to))
          }
          return false
        }
        case "HTMLBlock": {
          if (!touches(state, node.from, node.to)) {
            const html = state.sliceDoc(node.from, node.to)
            if (/^\s*<!--/.test(html)) return false
            out.push(Decoration.replace({ widget: new HTMLWidget(html), block: true }).range(node.from, node.to))
          }
          return false
        }
        case "Paragraph": {
          if (node.to - node.from <= 7 && /^\[toc\]$/i.test(state.sliceDoc(node.from, node.to).trim())) {
            if (!touches(state, node.from, node.to)) {
              headings = headings || collectHeadings(state, tree)
              out.push(Decoration.replace({ widget: new TocWidget(headings), block: true }).range(node.from, node.to))
            }
          }
          return false
        }
        default:
          return false
      }
    },
  })
  return Decoration.set(out, true)
}

export const blockPreview = StateField.define({
  create: (state) => buildBlocks(state),
  update(deco, tr) {
    if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(refreshEffect)) ||
        syntaxTree(tr.startState) !== syntaxTree(tr.state)) {
      return buildBlocks(tr.state)
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

// ---------- Link handling ----------

export const linkClicks = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target
    const link = target.closest?.(".md-link, .md-footnote-ref")
    if (!link) return false
    if (link.classList.contains("md-footnote-ref")) {
      if (!(event.metaKey || event.altKey)) return false
      event.preventDefault()
      jumpToFootnote(view, link.dataset.footnote)
      return true
    }
    if (!(event.metaKey)) return false
    event.preventDefault()
    const href = link.dataset.href
    if (href) linkHandler(href)
    return true
  },
})

let linkHandler = () => {}
export function setLinkHandler(fn) { linkHandler = fn }

export function jumpToFootnote(view, label) {
  const text = view.state.doc.toString()
  const idx = text.search(new RegExp("^\\[\\^" + label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\]:", "m"))
  if (idx >= 0) view.dispatch({ selection: { anchor: idx }, scrollIntoView: true })
}

export function livePreview() {
  return [inlinePreview, blockPreview, linkClicks]
}
