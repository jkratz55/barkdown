// Barkdown editor: CodeMirror 6 with Typora-style live preview, driven by the
// native app through window.barkdown and WKScriptMessageHandlers.
import { EditorState, Compartment, EditorSelection, Transaction, Prec } from "@codemirror/state"
import { EditorView, keymap, placeholder, lineNumbers, highlightSpecialChars, dropCursor } from "@codemirror/view"
import { defaultKeymap, history, undo, redo, indentMore, indentLess, insertTab, selectLine, selectParentSyntax, cursorDocStart, cursorDocEnd } from "@codemirror/commands"
import { markdown, commonmarkLanguage } from "@codemirror/lang-markdown"
import { GFM, Subscript, Superscript, Emoji } from "@lezer/markdown"
import { languages } from "@codemirror/language-data"
import { syntaxHighlighting, indentUnit, syntaxTree } from "@codemirror/language"
import { classHighlighter, tagHighlighter } from "@lezer/highlight"
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete"
import { searchKeymap } from "@codemirror/search"

import documentCSS from "./styles/document.css"
import editorCSS from "./styles/editor.css"
import katexCSS from "virtual:katex-css"
import { THEMES, themeInfo } from "./themes.js"
import { extraSyntax, highlightTag, mathTag, frontMatterTag, footnoteTag } from "./syntax.js"
import { livePreview, refreshEffect, collectHeadings, setLinkHandler, jumpToFootnote } from "./livepreview.js"
import { setScrollEffectFactory } from "./widgets.js"
import { focusMode, typewriterMode, documentStats } from "./modes.js"
import { findExtension, openFind, findNext, findPrevious, useSelectionForFind, findText } from "./find.js"
import { completions } from "./complete.js"
import { pasteHandling, htmlToMarkdown, handleImageFiles } from "./paste.js"
import * as cmd from "./commands.js"
import { renderDocument, escapeHTML, slugify, md } from "./render.js"
import { renderDiagram, clearDiagramCache } from "./diagrams.js"
import { env, post } from "./env.js"

// ---------- Styles ----------

function style(id, css) {
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement("style")
    el.id = id
    document.head.appendChild(el)
  }
  if (el.textContent !== css) el.textContent = css
}
style("bd-katex", katexCSS)
style("bd-document", documentCSS)
style("bd-editor", editorCSS)

// ---------- Configuration ----------

let config = {
  theme: "barkdown",
  themeCSS: "",
  customCSS: "",
  fontSize: 16,
  lineHeight: 0,
  contentWidth: 780,
  fontFamily: "",
  sourceMode: false,
  focusMode: false,
  typewriter: false,
  autoPairBrackets: true,
  autoPairMarkdown: true,
  spellcheck: true,
  lineNumbers: false,
  indentSize: 2,
  convertHTMLPaste: true,
  baseURL: null,
  homeURL: null,
  syntax: { math: true, highlight: true, supsub: true, diagrams: true, emoji: true },
  placeholder: "Start writing…",
}

const compartments = {
  lang: new Compartment(),
  preview: new Compartment(),
  focus: new Compartment(),
  typewriter: new Compartment(),
  attrs: new Compartment(),
  gutter: new Compartment(),
  pairs: new Compartment(),
  indent: new Compartment(),
  placeholder: new Compartment(),
}

function languageExtension(c) {
  const s = c.syntax || {}
  const exts = [GFM, ...extraSyntax(s)]
  if (s.supsub !== false) exts.push(Superscript, Subscript)
  if (s.emoji !== false) exts.push(Emoji)
  return markdown({ base: commonmarkLanguage, codeLanguages: languages, extensions: exts, addKeymap: true })
}

const customHighlighter = tagHighlighter([
  { tag: highlightTag, class: "tok-highlight" },
  { tag: mathTag, class: "tok-math" },
  { tag: frontMatterTag, class: "tok-frontmatter" },
  { tag: footnoteTag, class: "tok-footnote" },
])

// Pairs * _ ` around the caret the way Typora's "auto pair Markdown symbols" does.
const PAIRABLE = new Set(["*", "_", "`", "~", "="])
function markdownPairs() {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (!PAIRABLE.has(text) || view.composing) return false
    const { state } = view
    if (state.selection.ranges.length > 1) return false
    const range = state.selection.main
    const before = state.sliceDoc(from - 1, from), after = state.sliceDoc(to, to + 1)
    const lineStart = state.doc.lineAt(from).from
    const prefix = state.sliceDoc(lineStart, from)
    if (inCode(state, from) && text !== "`") return false
    if (!range.empty) {
      if (text === "~" || text === "=") {
        view.dispatch({ changes: [{ from, insert: text + text }, { from: to, insert: text + text }], selection: EditorSelection.range(from + 2, to + 2), userEvent: "input.type" })
      } else {
        view.dispatch({ changes: [{ from, insert: text }, { from: to, insert: text }], selection: EditorSelection.range(from + 1, to + 1), userEvent: "input.type" })
      }
      return true
    }
    if (text === "~" || text === "=") {
      // Only complete the doubled forms (~~ and ==).
      if (before === text && after !== text && !/\w/.test(after) && state.sliceDoc(from - 2, from - 1) !== text) {
        view.dispatch({ changes: { from, insert: text + text + text }, selection: { anchor: from + 1 }, userEvent: "input.type" })
        return true
      }
      if (after === text && before !== text) {
        view.dispatch({ selection: { anchor: from + 1 }, userEvent: "input.type" })
        return true
      }
      return false
    }
    if (before === text && after === text && text !== "`") {
      view.dispatch({ changes: { from, insert: text + text }, selection: { anchor: from + 1 }, userEvent: "input.type" })
      return true
    }
    if (after === text) {
      view.dispatch({ selection: { anchor: from + 1 }, userEvent: "input.type" })
      return true
    }
    if (text === "`" && /^[\s`>]*$/.test(prefix)) return false
    if ((text === "*" || text === "_") && /^\s*(>\s*)*$/.test(prefix)) return false
    if (/[\p{L}\p{N}]/u.test(before) || /[\p{L}\p{N}]/u.test(after)) return false
    view.dispatch({ changes: { from, insert: text + text }, selection: { anchor: from + 1 }, userEvent: "input.type" })
    return true
  })
}

function inCode(state, pos) {
  for (let n = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (/^(FencedCode|CodeBlock|InlineCode|InlineMath|BlockMath|FrontMatter)$/.test(n.name)) return true
  }
  return false
}

function pairExtension(c) {
  const out = []
  if (c.autoPairBrackets) {
    out.push(closeBrackets(), EditorState.languageData.of(() => [{ closeBrackets: { brackets: ["(", "[", "{", '"'] } }]))
  }
  if (c.autoPairMarkdown) out.push(markdownPairs())
  return out
}

function attrsExtension(c) {
  const cls = ["bd-editor"]
  if (c.sourceMode) cls.push("bd-source")
  if (!c.contentWidth) cls.push("bd-full-width")
  return [
    EditorView.editorAttributes.of({ class: cls.join(" ") }),
    EditorView.contentAttributes.of({ spellcheck: c.spellcheck ? "true" : "false", autocorrect: c.spellcheck ? "on" : "off", autocapitalize: "off" }),
  ]
}

// ---------- Keymap ----------

// Shortcuts the native menus own are removed so a keystroke never runs twice.
const NATIVE = new Set(["Mod-/", "Mod-i", "Mod-u", "Mod-Alt-\\", "Ctrl-m", "Alt-A"])
const filtered = defaultKeymap.filter((b) => !NATIVE.has(b.key) && !NATIVE.has(b.mac))

function inList(state) {
  for (let n = syntaxTree(state).resolveInner(state.selection.main.head, -1); n; n = n.parent) {
    if (n.name === "ListItem") return true
  }
  return false
}

const editingKeymap = [
  {
    key: "Tab",
    run: (view) => {
      const { state } = view
      if (inList(state) || !state.selection.main.empty) return indentMore(view)
      return insertTab(view)
    },
    shift: indentLess,
  },
  { key: "Escape", run: (view) => { if (!view.state.selection.main.empty) { view.dispatch({ selection: { anchor: view.state.selection.main.head } }); return true } return false } },
]

// ---------- Editor ----------

let view = null
let suppressChange = false

function createState(text) {
  return EditorState.create({
    doc: text,
    selection: EditorSelection.cursor(0),
    extensions: [
      compartments.lang.of(languageExtension(config)),
      syntaxHighlighting(classHighlighter),
      syntaxHighlighting(customHighlighter),
      history(),
      highlightSpecialChars(),
      dropCursor(),
      EditorView.lineWrapping,
      compartments.indent.of([indentUnit.of(" ".repeat(config.indentSize)), EditorState.tabSize.of(config.indentSize)]),
      compartments.pairs.of(pairExtension(config)),
      compartments.preview.of(config.sourceMode ? [] : livePreview()),
      compartments.focus.of(config.focusMode ? focusMode : []),
      compartments.typewriter.of(config.typewriter ? typewriterMode : []),
      compartments.attrs.of(attrsExtension(config)),
      compartments.gutter.of(config.sourceMode && config.lineNumbers ? lineNumbers() : []),
      compartments.placeholder.of(placeholder(config.placeholder)),
      findExtension(),
      completions,
      pasteHandling(() => ({ convertHTML: config.convertHTMLPaste })),
      Prec.high(keymap.of([...editingKeymap, ...closeBracketsKeymap])),
      keymap.of([...filtered, ...searchKeymap.filter((b) => b.key === "Escape")]),
      EditorView.updateListener.of(onUpdate),
    ],
  })
}

let changeTimer = null, metaTimer = null, selTimer = null
let lastActiveHeading = -2
let headingsCache = []

function onUpdate(u) {
  if (u.docChanged && !suppressChange) {
    clearTimeout(changeTimer)
    changeTimer = setTimeout(sendChange, 40)
  }
  if (u.docChanged || u.selectionSet) {
    clearTimeout(metaTimer)
    metaTimer = setTimeout(sendMeta, u.docChanged ? 250 : 120)
  }
  if (u.selectionSet && !u.docChanged) {
    clearTimeout(selTimer)
    selTimer = setTimeout(sendActiveHeading, 60)
  }
}

function sendChange() {
  clearTimeout(changeTimer)
  changeTimer = null
  post({ type: "change", text: view.state.doc.toString() })
}

function sendMeta() {
  const { state } = view
  headingsCache = collectHeadings(state)
  post({ type: "outline", items: headingsCache.map((h) => ({ level: h.level, text: h.text, pos: h.pos, line: h.line })) })
  post({ type: "stats", ...documentStats(state) })
  lastActiveHeading = -2
  sendActiveHeading()
}

function sendActiveHeading() {
  const head = view.state.selection.main.head
  let idx = -1
  for (let i = 0; i < headingsCache.length; i++) {
    if (headingsCache[i].pos <= head) idx = i
    else break
  }
  if (idx !== lastActiveHeading) {
    lastActiveHeading = idx
    post({ type: "activeHeading", index: idx })
  }
}

function reconfigure(prev, next) {
  const effects = []
  const changed = (k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k])
  if (changed("syntax")) effects.push(compartments.lang.reconfigure(languageExtension(next)))
  if (changed("sourceMode")) effects.push(compartments.preview.reconfigure(next.sourceMode ? [] : livePreview()))
  if (changed("focusMode")) effects.push(compartments.focus.reconfigure(next.focusMode ? focusMode : []))
  if (changed("typewriter")) effects.push(compartments.typewriter.reconfigure(next.typewriter ? typewriterMode : []))
  if (changed("sourceMode") || changed("spellcheck") || changed("contentWidth")) effects.push(compartments.attrs.reconfigure(attrsExtension(next)))
  if (changed("sourceMode") || changed("lineNumbers")) effects.push(compartments.gutter.reconfigure(next.sourceMode && next.lineNumbers ? lineNumbers() : []))
  if (changed("autoPairBrackets") || changed("autoPairMarkdown")) effects.push(compartments.pairs.reconfigure(pairExtension(next)))
  if (changed("indentSize")) effects.push(compartments.indent.reconfigure([indentUnit.of(" ".repeat(next.indentSize)), EditorState.tabSize.of(next.indentSize)]))
  if (changed("placeholder")) effects.push(compartments.placeholder.reconfigure(placeholder(next.placeholder)))
  if (changed("baseURL") || changed("theme") || changed("themeCSS")) effects.push(refreshEffect.of(null))
  if (effects.length) view.dispatch({ effects })
}

function applyAppearance(c) {
  const theme = THEMES[c.theme] || null
  const isCustom = !theme
  const base = isCustom ? THEMES[c.themeDark ? "barkdown-dark" : "barkdown"] : theme
  style("bd-theme", base.css + "\n" + (isCustom ? c.themeCSS || "" : ""))
  style("bd-custom", c.customCSS || "")
  const root = document.documentElement.style
  root.setProperty("--bd-font-size", c.fontSize + "px")
  if (c.contentWidth) root.setProperty("--bd-content-width", c.contentWidth + "px")
  else root.removeProperty("--bd-content-width")
  if (c.lineHeight) root.setProperty("--bd-line-height", String(c.lineHeight))
  else root.removeProperty("--bd-line-height")
  if (c.fontFamily) root.setProperty("--bd-font-body", c.fontFamily)
  else root.removeProperty("--bd-font-body")
  const dark = isCustom ? !!c.themeDark : base.dark
  if (env.dark !== dark) clearDiagramCache()
  env.dark = dark
  document.documentElement.classList.toggle("bd-dark", dark)
  document.documentElement.dataset.theme = c.theme
}

function setConfig(partial) {
  const prev = config
  config = { ...config, ...partial, syntax: { ...config.syntax, ...(partial.syntax || {}) } }
  env.baseURL = config.baseURL
  env.homeURL = config.homeURL
  env.diagrams = config.syntax.diagrams !== false
  applyAppearance(config)
  if (view) reconfigure(prev, config)
}

function scrollEffect(pos) {
  return EditorView.scrollIntoView(pos, { y: "start", yMargin: 80 })
}
setScrollEffectFactory(scrollEffect)

// ---------- Commands ----------

const COMMANDS = {
  undo: (v) => undo(v),
  redo: (v) => redo(v),
  strong: (v) => cmd.toggleInline(v, "strong"),
  emphasis: (v) => cmd.toggleInline(v, "emphasis"),
  underline: (v) => cmd.toggleInline(v, "underline"),
  code: (v) => cmd.toggleInline(v, "code"),
  strike: (v) => cmd.toggleInline(v, "strike"),
  highlight: (v) => cmd.toggleInline(v, "highlight"),
  superscript: (v) => cmd.toggleInline(v, "superscript"),
  subscript: (v) => cmd.toggleInline(v, "subscript"),
  inlineMath: (v) => cmd.toggleInline(v, "math"),
  comment: (v) => cmd.toggleInline(v, "comment"),
  heading: (v, n) => cmd.setHeading(v, Number(n)),
  paragraph: (v) => cmd.setHeading(v, 0, false),
  increaseHeading: (v) => cmd.shiftHeading(v, 1),
  decreaseHeading: (v) => cmd.shiftHeading(v, -1),
  quote: (v) => cmd.toggleQuote(v),
  orderedList: (v) => cmd.toggleList(v, "ol"),
  unorderedList: (v) => cmd.toggleList(v, "ul"),
  taskList: (v) => cmd.toggleList(v, "task"),
  codeFence: (v, lang) => cmd.codeFence(v, lang || ""),
  mathBlock: (v) => cmd.mathBlock(v),
  table: (v, a) => cmd.insertTable(v, a?.rows ?? 3, a?.cols ?? 3),
  horizontalRule: (v) => cmd.horizontalRule(v),
  toc: (v) => cmd.tableOfContents(v),
  frontMatter: (v) => cmd.frontMatter(v),
  footnote: (v) => cmd.footnote(v),
  linkReference: (v) => cmd.linkReference(v),
  hyperlink: (v, url) => cmd.hyperlink(v, url),
  image: (v, src) => cmd.image(v, src || ""),
  clearFormat: (v) => cmd.clearFormat(v),
  paragraphAbove: (v) => cmd.insertParagraph(v, false),
  paragraphBelow: (v) => cmd.insertParagraph(v, true),
  find: (v) => openFind(v, false),
  replace: (v) => openFind(v, true),
  findNext: (v) => findNext(v),
  findPrevious: (v) => findPrevious(v),
  useSelectionForFind: (v) => useSelectionForFind(v),
  selectLine: (v) => selectLine(v),
  selectBlock: (v) => selectParentSyntax(v),
  jumpTop: (v) => cursorDocStart(v),
  jumpBottom: (v) => cursorDocEnd(v),
}

// ---------- Export ----------

function hasMath(text) { return /\$[^$\s]|\$\$|```\s*(math|latex|katex)/i.test(text) }

async function exportHTML(opts = {}) {
  const text = view.state.doc.toString()
  const { html, headings } = await renderDocument(text, {
    mathMode: opts.mathMode || "katex",
    diagrams: config.syntax.diagrams !== false,
    absoluteImages: !!opts.absoluteImages,
    baseURL: config.baseURL,
    homeURL: config.homeURL,
    renderDiagram: opts.mathMode === "tex" ? null : renderDiagram,
  })
  if (!opts.standalone) return html
  const title = opts.title || headings[0]?.text || "Document"
  const themeID = opts.theme && THEMES[opts.theme] ? opts.theme : config.theme
  const theme = THEMES[themeID]
  let css = ""
  if (hasMath(text) && opts.mathMode !== "tex") css += katexCSS + "\n"
  if (opts.styled !== false) {
    css += documentCSS + "\n" + (theme ? theme.css : (THEMES.barkdown.css + "\n" + (config.themeCSS || ""))) + "\n" + (config.customCSS || "")
    css += `\n:root { --bd-font-size: ${config.fontSize}px; }`
    if (opts.print) css += `\nhtml, .bd-export { background: transparent; } .bd-export * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .bd-export .markdown-body { padding: 0; max-width: none; }`
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Barkdown">
<title>${escapeHTML(title)}</title>
${css ? `<style>\n${css}\n</style>` : ""}
</head>
<body class="bd-export">
<article class="markdown-body">
${html}
</article>
</body>
</html>
`
}

function selectionMarkdown() {
  const { state } = view
  return state.selection.ranges.map((r) => state.sliceDoc(r.from, r.to)).join("\n")
}

// ---------- Public API ----------

function scrollToPos(pos, select = true) {
  const p = Math.max(0, Math.min(pos, view.state.doc.length))
  const line = view.state.doc.lineAt(p)
  view.dispatch({
    selection: select ? { anchor: line.to } : undefined,
    effects: scrollEffect(line.from),
  })
  view.focus()
}

window.barkdown = {
  init(text, cfg) {
    setConfig(cfg || {})
    if (view) view.destroy()
    view = new EditorView({ state: createState(text || ""), parent: document.getElementById("editor") })
    env.view = view
    view.focus()
    sendMeta()
  },
  setText(text) {
    if (!view || text === view.state.doc.toString()) return
    const sel = view.state.selection.main
    suppressChange = true
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      selection: EditorSelection.cursor(Math.min(sel.head, text.length)),
      annotations: Transaction.addToHistory.of(false),
    })
    suppressChange = false
  },
  getText() { return view ? view.state.doc.toString() : "" },
  flush() { if (changeTimer) sendChange() },
  setConfig,
  command(name, arg) {
    const fn = COMMANDS[name]
    if (!fn || !view) return false
    fn(view, arg)
    return true
  },
  focus() { view?.focus() },
  scrollToPos,
  scrollToLine(n) {
    const line = view.state.doc.line(Math.max(1, Math.min(n, view.state.doc.lines)))
    scrollToPos(line.from)
  },
  find(text) { findText(view, text); view.focus() },
  insertText(text) {
    view.dispatch(view.state.replaceSelection(text), { userEvent: "input.paste", scrollIntoView: true })
    view.focus()
  },
  insertImages(paths, x, y) {
    const pos = x != null ? view.posAtCoords({ x, y }) : null
    cmd.insertImages(view, paths, pos ?? undefined)
  },
  async exportHTML(opts) { return await exportHTML(opts || {}) },
  selectionMarkdown,
  selectionHTML() { return md.render(selectionMarkdown(), {}) },
  hasSelection() { return view ? !view.state.selection.main.empty : false },
  htmlToMarkdown(html) { return htmlToMarkdown(html) },
  themes: themeInfo,
  openAnchor(anchor) { return openAnchor(anchor) },
}

function openAnchor(anchor) {
  const slug = decodeURIComponent(anchor.replace(/^#/, ""))
  if (slug.startsWith("^")) { jumpToFootnote(view, slug.slice(1)); return true }
  const h = headingsCache.find((h) => slugify(h.text) === slug)
  if (h) { scrollToPos(h.pos); return true }
  return false
}

setLinkHandler((href) => {
  if (href.startsWith("#")) { openAnchor(href); return }
  post({ type: "openLink", href })
})

// Holding ⌘ turns links into pointer targets.
window.addEventListener("keydown", (e) => { if (e.key === "Meta") document.body.classList.add("bd-cmd-down") })
window.addEventListener("keyup", (e) => { if (e.key === "Meta") document.body.classList.remove("bd-cmd-down") })
window.addEventListener("blur", () => document.body.classList.remove("bd-cmd-down"))

// Never let a dropped file navigate the web view away from the editor.
window.addEventListener("dragover", (e) => e.preventDefault())
window.addEventListener("drop", (e) => {
  if (e.defaultPrevented) return
  e.preventDefault()
  const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"))
  if (files.length && view) handleImageFiles(view, files)
})

window.addEventListener("error", (e) => post({ type: "log", level: "error", message: `${e.message} @ ${e.filename}:${e.lineno}` }))
window.addEventListener("unhandledrejection", (e) => post({ type: "log", level: "error", message: "Unhandled: " + (e.reason?.stack || e.reason) }))
const origError = console.error
console.error = (...args) => { post({ type: "log", level: "error", message: args.map(String).join(" ") }); origError(...args) }

applyAppearance(config)
post({ type: "ready" })
