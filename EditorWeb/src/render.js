// Markdown → HTML rendering, used for export, "Copy as HTML" and table cells.
import MarkdownIt from "markdown-it"
import footnote from "markdown-it-footnote"
import mark from "markdown-it-mark"
import sub from "markdown-it-sub"
import sup from "markdown-it-sup"
import { full as emoji } from "markdown-it-emoji"
import frontMatter from "markdown-it-front-matter"
import katex from "katex"
import { highlightTree, classHighlighter } from "@lezer/highlight"
import { LanguageDescription } from "@codemirror/language"
import { languages } from "@codemirror/language-data"

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
}

export function slugify(text) {
  return String(text).trim().toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-")
}

// ---------- Math ----------

const mathCache = new Map()
export function renderMath(tex, displayMode) {
  const key = (displayMode ? "D" : "I") + tex
  let html = mathCache.get(key)
  if (html === undefined) {
    try {
      html = katex.renderToString(tex, { displayMode, throwOnError: false, output: "htmlAndMathml", trust: false, strict: "ignore" })
    } catch (e) {
      html = `<span class="md-math-error">${escapeHTML(e.message || String(e))}</span>`
    }
    if (mathCache.size > 2000) mathCache.clear()
    mathCache.set(key, html)
  }
  return html
}

function mathPlugin(md) {
  md.inline.ruler.after("escape", "math_inline", (state, silent) => {
    const src = state.src, start = state.pos
    if (src.charCodeAt(start) !== 36) return false
    const double = src.charCodeAt(start + 1) === 36
    const open = double ? 2 : 1
    const first = src.charCodeAt(start + open)
    if (!first || first === 32 || first === 9 || first === 10 || (!double && first === 36)) return false
    for (let i = start + open; i < state.posMax; i++) {
      const ch = src.charCodeAt(i)
      if (ch === 92) { i++; continue }
      if (ch !== 36) continue
      if (double) {
        if (src.charCodeAt(i + 1) !== 36) continue
        if (!silent) {
          const tok = state.push("math_inline", "math", 0)
          tok.content = src.slice(start + 2, i)
          tok.meta = { display: true }
        }
        state.pos = i + 2
        return true
      }
      const prev = src.charCodeAt(i - 1)
      if (prev === 32 || prev === 9 || prev === 10) continue
      const after = src.charCodeAt(i + 1)
      if (after >= 48 && after <= 57) continue
      if (!silent) {
        const tok = state.push("math_inline", "math", 0)
        tok.content = src.slice(start + 1, i)
        tok.meta = { display: false }
      }
      state.pos = i + 1
      return true
    }
    return false
  })

  md.block.ruler.before("fence", "math_block", (state, startLine, endLine, silent) => {
    let pos = state.bMarks[startLine] + state.tShift[startLine]
    let max = state.eMarks[startLine]
    if (pos + 2 > max || state.src.slice(pos, pos + 2) !== "$$") return false
    const firstRest = state.src.slice(pos + 2, max)
    let content, next = startLine
    const single = firstRest.trim().endsWith("$$") && firstRest.trim().length > 2
    if (single) {
      content = firstRest.trim().slice(0, -2)
    } else {
      if (firstRest.trim()) return false
      const lines = []
      let closed = false
      while (++next < endLine) {
        const s = state.bMarks[next] + state.tShift[next], e = state.eMarks[next]
        const text = state.src.slice(s, e)
        if (/^\$\$\s*$/.test(text)) { closed = true; break }
        lines.push(state.src.slice(state.bMarks[next], e))
      }
      if (!closed) next = endLine - 1
      content = lines.join("\n")
    }
    if (silent) return true
    const tok = state.push("math_block", "math", 0)
    tok.block = true
    tok.content = content
    tok.map = [startLine, next + 1]
    state.line = next + 1
    return true
  }, { alt: ["paragraph", "reference", "blockquote", "list"] })

  md.renderer.rules.math_inline = (tokens, idx, opts, env) => {
    const tok = tokens[idx]
    if (env.mathMode === "tex") return `<code class="md-math-tex">${escapeHTML(tok.content)}</code>`
    return renderMath(tok.content, tok.meta.display)
  }
  md.renderer.rules.math_block = (tokens, idx, opts, env) => {
    const tok = tokens[idx]
    if (env.mathMode === "tex") return `<pre class="md-math-tex"><code>${escapeHTML(tok.content)}</code></pre>\n`
    return `<div class="md-math-block">${renderMath(tok.content, true)}</div>\n`
  }
}

// ---------- Task lists ----------

function taskListPlugin(md) {
  md.core.ruler.after("inline", "task_lists", (state) => {
    const tokens = state.tokens
    for (let i = 2; i < tokens.length; i++) {
      const tok = tokens[i]
      if (tok.type !== "inline" || tokens[i - 1].type !== "paragraph_open" || tokens[i - 2].type !== "list_item_open") continue
      const m = /^\[([ xX])\]\s/.exec(tok.content)
      if (!m) continue
      const checked = m[1] !== " "
      const first = tok.children[0]
      if (first && first.type === "text") first.content = first.content.replace(/^\[[ xX]\]\s/, "")
      const box = new state.Token("html_inline", "", 0)
      box.content = `<input type="checkbox" class="task-list-item-checkbox" disabled${checked ? " checked" : ""}> `
      tok.children.unshift(box)
      tokens[i - 2].attrJoin("class", "task-list-item" + (checked ? " task-done" : ""))
      for (let j = i - 3; j >= 0; j--) {
        if (tokens[j].type === "bullet_list_open" || tokens[j].type === "ordered_list_open") {
          if (tokens[j].level === tokens[i - 2].level - 1) { tokens[j].attrSet("class", "contains-task-list"); break }
        }
      }
    }
  })
}

// ---------- Headings, TOC ----------

function headingPlugin(md) {
  md.core.ruler.push("heading_ids", (state) => {
    const used = new Map()
    const headings = []
    const tokens = state.tokens
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "heading_open") continue
      const inline = tokens[i + 1]
      const text = inline.children.filter((c) => c.type === "text" || c.type === "code_inline").map((c) => c.content).join("")
      let slug = slugify(text) || "section"
      const n = used.get(slug) || 0
      used.set(slug, n + 1)
      if (n) slug += "-" + n
      tokens[i].attrSet("id", slug)
      headings.push({ level: Number(tokens[i].tag.slice(1)), text, slug })
    }
    state.env.headings = headings
  })

  md.core.ruler.after("heading_ids", "toc", (state) => {
    const tokens = state.tokens
    for (let i = 0; i < tokens.length - 2; i++) {
      if (tokens[i].type === "paragraph_open" && tokens[i + 1].type === "inline" &&
          /^\[toc\]$/i.test(tokens[i + 1].content.trim()) && tokens[i + 2].type === "paragraph_close") {
        const tok = new state.Token("html_block", "", 0)
        tok.content = tocHTML(state.env.headings || [])
        tokens.splice(i, 3, tok)
      }
    }
  })
}

export function tocHTML(headings, interactive = false) {
  if (!headings.length) return `<nav class="md-toc md-toc-empty">Table of Contents</nav>\n`
  const min = Math.min(...headings.map((h) => h.level))
  const items = headings.map((h, i) => {
    const attrs = interactive ? `data-index="${i}"` : `href="#${escapeHTML(h.slug)}"`
    return `<li class="md-toc-item md-toc-h${h.level - min + 1}"><a ${attrs}>${escapeHTML(h.text)}</a></li>`
  }).join("")
  return `<nav class="md-toc"><ul>${items}</ul></nav>\n`
}

// ---------- Code highlighting ----------

export function findLanguage(name) {
  if (!name) return null
  return LanguageDescription.matchLanguageName(languages, name, true)
}

export async function preloadLanguages(markdown) {
  const names = new Set()
  const re = /^\s*(?:```|~~~)\s*([\w#+.-]+)/gm
  let m
  while ((m = re.exec(markdown))) names.add(m[1])
  await Promise.all([...names].map(async (n) => {
    const d = findLanguage(n)
    if (d && !d.support) { try { await d.load() } catch {} }
  }))
}

export function highlightCode(code, lang) {
  const desc = findLanguage(lang)
  if (!desc || !desc.support) return escapeHTML(code)
  const tree = desc.support.language.parser.parse(code)
  let out = "", pos = 0
  highlightTree(tree, classHighlighter, (from, to, classes) => {
    if (from > pos) out += escapeHTML(code.slice(pos, from))
    out += `<span class="${classes}">${escapeHTML(code.slice(from, to))}</span>`
    pos = to
  })
  return out + escapeHTML(code.slice(pos))
}

// ---------- Instance ----------

function createMarkdownIt(opts = {}) {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false, breaks: false })
  md.use(frontMatter, (fm) => { md.__frontMatter = fm })
  md.use(footnote).use(mark).use(sub).use(sup).use(emoji)
  md.use(mathPlugin).use(taskListPlugin).use(headingPlugin)

  const defaultFence = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const tok = tokens[idx]
    const lang = tok.info.trim().split(/\s+/)[0] || ""
    if (/^mermaid$/i.test(lang) && env.diagrams !== false) {
      return `<div class="md-diagram" data-mermaid="${escapeHTML(tok.content)}"></div>\n`
    }
    if (/^(math|latex|tex|katex)$/i.test(lang) && env.mathMode !== "tex") {
      return `<div class="md-math-block">${renderMath(tok.content, true)}</div>\n`
    }
    const cls = lang ? ` class="language-${escapeHTML(lang)}"` : ""
    return `<pre class="md-fences"${lang ? ` data-lang="${escapeHTML(lang)}"` : ""}><code${cls}>${highlightCode(tok.content.replace(/\n$/, ""), lang)}</code></pre>\n`
  }
  void defaultFence

  // Underline / comments are raw HTML in Markdown; nothing to do. Images: rewrite sources.
  const defaultImage = md.renderer.rules.image
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const tok = tokens[idx]
    const src = tok.attrGet("src")
    if (src && env.resolveImage) tok.attrSet("src", env.resolveImage(src))
    return defaultImage(tokens, idx, options, env, self)
  }
  return md
}

export const md = createMarkdownIt()

export function renderInline(text) {
  return md.renderInline(text, {})
}

export function stripFrontMatter(text) {
  const m = /^---[ \t]*\n(?:[\s\S]*?\n)?(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(text)
  return m ? { frontMatter: m[0], body: text.slice(m[0].length) } : { frontMatter: "", body: text }
}

// Resolves a Markdown image/link target against the document's folder.
export function resolveURL(src, baseURL, homeURL) {
  if (!src) return src
  if (/^(https?:|data:|file:|blob:|mailto:)/i.test(src)) return src
  try {
    if (src.startsWith("~/") && homeURL) return new URL(src.slice(2), homeURL).href
    if (src.startsWith("/")) return new URL("file://" + encodeURI(decodeSafe(src))).href
    if (baseURL) return new URL(encodeURI(decodeSafe(src)), baseURL).href
  } catch {}
  return src
}

function decodeSafe(s) { try { return decodeURI(s) } catch { return s } }

export async function renderDocument(markdown, opts = {}) {
  await preloadLanguages(markdown)
  const env = {
    mathMode: opts.mathMode || "katex",
    diagrams: opts.diagrams,
    resolveImage: opts.absoluteImages ? (src) => resolveURL(src, opts.baseURL, opts.homeURL) : null,
  }
  let html = md.render(markdown, env)
  if (opts.renderDiagram && html.includes('class="md-diagram"')) {
    const div = document.createElement("div")
    div.innerHTML = html
    for (const el of div.querySelectorAll(".md-diagram[data-mermaid]")) {
      const code = el.getAttribute("data-mermaid")
      el.removeAttribute("data-mermaid")
      try { el.innerHTML = await opts.renderDiagram(code) }
      catch (e) { el.innerHTML = `<pre class="md-diagram-error">${escapeHTML(String(e.message || e))}</pre>` }
    }
    html = div.innerHTML
  }
  return { html, headings: env.headings || [] }
}
