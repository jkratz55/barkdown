// Rich-text paste (HTML → Markdown), image paste/drop and import conversion.
import TurndownService from "turndown"
import { gfm } from "turndown-plugin-gfm"
import { EditorView } from "@codemirror/view"
import { syntaxTree } from "@codemirror/language"
import { request } from "./env.js"
import { insertImages } from "./commands.js"

let turndown = null
function service() {
  if (turndown) return turndown
  turndown = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined",
  })
  turndown.use(gfm)
  turndown.addRule("highlight", { filter: ["mark"], replacement: (c) => `==${c}==` })
  turndown.addRule("underline", { filter: ["u", "ins"], replacement: (c) => `<u>${c}</u>` })
  turndown.addRule("sup", { filter: ["sup"], replacement: (c) => `^${c}^` })
  turndown.addRule("sub", { filter: ["sub"], replacement: (c) => `~${c}~` })
  turndown.addRule("katex", {
    filter: (node) => node.classList?.contains("katex") || node.classList?.contains("katex-display"),
    replacement: (c, node) => {
      const tex = node.querySelector?.('annotation[encoding="application/x-tex"]')?.textContent
      if (!tex) return c
      return node.classList.contains("katex-display") ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`
    },
  })
  turndown.addRule("codeWithLanguage", {
    filter: (node) => node.nodeName === "PRE",
    replacement: (_c, node) => {
      const code = node.querySelector("code") || node
      const cls = (code.getAttribute("class") || "") + " " + (node.getAttribute("class") || "")
      const lang = (/(?:language|lang)-([\w#+-]+)/.exec(cls) || [])[1] || node.getAttribute("data-lang") || ""
      const text = code.textContent.replace(/\n$/, "")
      const fence = text.includes("```") ? "~~~" : "```"
      return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`
    },
  })
  turndown.remove(["script", "style", "meta", "title", "head"])
  return turndown
}

export function htmlToMarkdown(html) {
  return service().turndown(html).replace(/\n{3,}/g, "\n\n").trim() + "\n"
}

// Only treat clipboard HTML as rich text when it carries real structure; code
// editors put styled <span>/<div> soup on the clipboard that should stay plain.
function isSemantic(html) {
  if (/vscode|monaco|cm-line|<meta name=["']?generator["']? content=["']?(Xcode|Sublime)/i.test(html)) return false
  return /<(p|h[1-6]|ul|ol|li|a\s|img|table|strong|b|em|i|blockquote|pre|code|mark|del|s|hr)\b/i.test(html)
}

function inCode(state, pos) {
  for (let n = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (n.name === "FencedCode" || n.name === "CodeBlock" || n.name === "InlineCode" || n.name === "BlockMath") return true
  }
  return false
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(",")[1] || "")
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export async function handleImageFiles(view, files, pos) {
  const paths = []
  for (const f of files) {
    const data = await toBase64(f)
    const path = await request({ type: "saveImage", data, name: f.name || "image.png", mime: f.type })
    if (path) paths.push(path)
  }
  insertImages(view, paths, pos)
}

export const pasteHandling = (opts) => EditorView.domEventHandlers({
  paste(event, view) {
    const dt = event.clipboardData
    if (!dt) return false
    const files = [...dt.files].filter((f) => f.type.startsWith("image/"))
    const clipHTML = dt.getData("text/html")
    // Images copied in Finder or a browser: save the image data next to the document.
    if (files.length && (!clipHTML || /^\s*(<meta[^>]*>\s*)?<img\b[^>]*>\s*$/i.test(clipHTML))) {
      event.preventDefault()
      handleImageFiles(view, files)
      return true
    }
    const html = dt.getData("text/html")
    if (html && opts().convertHTML && !inCode(view.state, view.state.selection.main.head) && isSemantic(html)) {
      let md
      try { md = htmlToMarkdown(html) } catch { md = null }
      if (md && md.trim()) {
        event.preventDefault()
        const text = md.replace(/\n$/, "")
        view.dispatch(view.state.replaceSelection(text), { userEvent: "input.paste", scrollIntoView: true })
        return true
      }
    }
    return false
  },
  drop(event, view) {
    const files = [...(event.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"))
    if (!files.length) return false
    event.preventDefault()
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head
    handleImageFiles(view, files, pos)
    return true
  },
})
