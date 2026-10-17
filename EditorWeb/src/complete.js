// Autocomplete for :emoji: shortcodes and fenced-code languages.
import { autocompletion } from "@codemirror/autocomplete"
import { syntaxTree } from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import full from "markdown-it-emoji/lib/data/full.mjs"

const emojiNames = Object.keys(full)

function inCode(state, pos) {
  for (let n = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (/^(FencedCode|CodeBlock|InlineCode|BlockMath|InlineMath)$/.test(n.name)) return true
  }
  return false
}

function emojiSource(ctx) {
  const m = ctx.matchBefore(/(^|[\s(])(:[\w+-]{2,})$/)
  if (!m) return null
  const start = m.from + m.text.indexOf(":")
  if (inCode(ctx.state, ctx.pos)) return null
  const q = ctx.state.sliceDoc(start + 1, ctx.pos).toLowerCase()
  const starts = [], contains = []
  for (const n of emojiNames) {
    if (n.startsWith(q)) starts.push(n)
    else if (q.length > 2 && n.includes(q)) contains.push(n)
    if (starts.length > 40) break
  }
  const options = [...starts, ...contains].slice(0, 40).map((n) => ({
    label: ":" + n + ":",
    displayLabel: `${full[n]}  ${n}`,
    type: "emoji",
  }))
  if (!options.length) return null
  return { from: start, options, filter: false }
}

const langOptions = (() => {
  const seen = new Set(), out = []
  for (const l of languages) {
    for (const name of [l.alias[0] || l.name.toLowerCase(), ...l.alias.slice(1)]) {
      if (!name || seen.has(name) || /\s/.test(name)) continue
      seen.add(name)
      out.push({ label: name, detail: l.name, type: "language" })
    }
  }
  for (const extra of ["mermaid", "math"]) out.unshift({ label: extra, detail: extra === "mermaid" ? "Diagram" : "LaTeX", type: "language" })
  return out
})()

function languageSource(ctx) {
  const line = ctx.state.doc.lineAt(ctx.pos)
  const before = line.text.slice(0, ctx.pos - line.from)
  const m = /^(\s*(?:>\s*)*)(```|~~~)([\w#+.-]*)$/.exec(before)
  if (!m) return null
  return { from: ctx.pos - m[3].length, options: langOptions, validFor: /^[\w#+.-]*$/ }
}

export const completions = autocompletion({
  override: [emojiSource, languageSource],
  icons: false,
  activateOnTyping: true,
  closeOnBlur: true,
})
