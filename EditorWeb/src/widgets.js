// Rendered stand-ins for Markdown constructs in live-preview mode.
import { WidgetType } from "@codemirror/view"
import { env, request } from "./env.js"
import { renderMath, resolveURL, escapeHTML } from "./render.js"
import { renderDiagram, cachedDiagram } from "./diagrams.js"

// Moves the cursor into the widget's source so it reveals itself for editing.
function revealOnClick(dom, view, offset = 0) {
  dom.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    let pos
    try { pos = view.posAtDOM(dom) } catch { return }
    const anchor = Math.min(view.state.doc.length, pos + (typeof offset === "function" ? offset(view.state, pos) : offset))
    view.dispatch({ selection: { anchor }, scrollIntoView: false })
    view.focus()
  })
}

export class ImageWidget extends WidgetType {
  constructor(src, alt, title, { preview = false, block = false } = {}) {
    super()
    this.src = src
    this.alt = alt
    this.title = title
    this.preview = preview
    this.block = block
    this.base = env.baseURL
  }
  eq(o) {
    return o.src === this.src && o.alt === this.alt && o.title === this.title &&
      o.preview === this.preview && o.block === this.block && o.base === this.base
  }
  toDOM(view) {
    const wrap = document.createElement("span")
    wrap.className = "md-image" + (this.block || this.preview ? " md-image-block" : "") + (this.preview ? " md-image-preview" : "")
    const url = resolveURL(this.src, env.baseURL, env.homeURL)
    const img = document.createElement("img")
    img.alt = this.alt || ""
    if (this.title) img.title = this.title
    img.draggable = false
    img.onload = () => view.requestMeasure()
    img.onerror = () => {
      wrap.classList.add("md-image-broken")
      wrap.innerHTML = `<span class="md-image-broken-icon">⚠︎</span><span>${escapeHTML(this.alt || "Image")}</span><span class="md-image-broken-src">${escapeHTML(this.src || "")}</span>`
      view.requestMeasure()
    }
    if (url) img.src = url
    else img.onerror()
    wrap.appendChild(img)
    if (!this.preview) revealOnClick(wrap, view, 2)
    return wrap
  }
  ignoreEvent() { return true }
}

export class MathWidget extends WidgetType {
  constructor(tex, display, preview = false) {
    super()
    this.tex = tex
    this.display = display
    this.preview = preview
  }
  eq(o) { return o.tex === this.tex && o.display === this.display && o.preview === this.preview }
  toDOM(view) {
    if (this.preview && !this.display) {
      const anchor = document.createElement("span")
      anchor.className = "md-math-popover-anchor"
      if (this.tex.trim()) {
        const pop = document.createElement("span")
        pop.className = "md-math-popover"
        pop.innerHTML = renderMath(this.tex, false)
        anchor.appendChild(pop)
      }
      return anchor
    }
    const el = document.createElement(this.display ? "div" : "span")
    el.className = this.display ? "md-math-block" : "md-math-inline"
    if (this.preview) el.classList.add("md-math-preview")
    if (!this.tex.trim()) {
      el.classList.add("md-math-empty")
      el.textContent = this.display ? "Empty math block" : "∅"
    } else {
      el.innerHTML = renderMath(this.tex, this.display)
    }
    if (!this.preview) revealOnClick(el, view, this.display ? (state, pos) => state.doc.lineAt(pos).length + 1 : 1)
    return el
  }
  ignoreEvent() { return true }
}

export class DiagramWidget extends WidgetType {
  constructor(code, preview = false) {
    super()
    this.code = code
    this.preview = preview
    this.dark = env.dark
  }
  eq(o) { return o.code === this.code && o.preview === this.preview && o.dark === this.dark }
  toDOM(view) {
    const el = document.createElement("div")
    el.className = "md-diagram" + (this.preview ? " md-diagram-preview" : "")
    const cached = cachedDiagram(this.code)
    if (cached) el.innerHTML = cached
    else {
      el.innerHTML = `<div class="md-diagram-loading">Rendering diagram…</div>`
      renderDiagram(this.code).then((svg) => {
        el.innerHTML = svg
        view.requestMeasure()
      }).catch((e) => {
        el.innerHTML = `<div class="md-diagram-error">${escapeHTML(String(e?.message || e).split("\n").slice(0, 6).join("\n"))}</div>`
        view.requestMeasure()
      })
    }
    if (!this.preview) revealOnClick(el, view, (state, pos) => state.doc.lineAt(pos).length + 1)
    return el
  }
  ignoreEvent() { return true }
}

export class HRWidget extends WidgetType {
  eq() { return true }
  toDOM() {
    const el = document.createElement("span")
    el.className = "md-hr"
    return el
  }
  ignoreEvent() { return false }
}

const BULLETS = ["•", "◦", "▪"]
export class BulletWidget extends WidgetType {
  constructor(depth) { super(); this.depth = depth }
  eq(o) { return o.depth === this.depth }
  toDOM() {
    const el = document.createElement("span")
    el.className = "md-bullet"
    el.textContent = BULLETS[this.depth % BULLETS.length]
    return el
  }
  ignoreEvent() { return false }
}

export class CheckboxWidget extends WidgetType {
  constructor(checked) { super(); this.checked = checked }
  eq(o) { return o.checked === this.checked }
  toDOM(view) {
    const el = document.createElement("span")
    el.className = "md-checkbox" + (this.checked ? " checked" : "")
    el.setAttribute("role", "checkbox")
    el.setAttribute("aria-checked", String(this.checked))
    el.innerHTML = `<svg viewBox="0 0 16 16" width="11" height="11"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    el.addEventListener("mousedown", (e) => {
      e.preventDefault()
      let pos
      try { pos = view.posAtDOM(el) } catch { return }
      const text = view.state.doc.sliceString(pos, pos + 3)
      if (!/^\[[ xX]\]$/.test(text)) return
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: text[1] === " " ? "x" : " " }, userEvent: "input.toggle" })
    })
    return el
  }
  ignoreEvent() { return true }
}

export class CodeHeaderWidget extends WidgetType {
  constructor(lang, code) { super(); this.lang = lang; this.code = code }
  eq(o) { return o.lang === this.lang && o.code === this.code }
  toDOM(view) {
    const el = document.createElement("span")
    el.className = "md-code-header"
    const label = document.createElement("span")
    label.className = "md-code-lang"
    label.textContent = this.lang || "plain text"
    const copy = document.createElement("button")
    copy.className = "md-code-copy"
    copy.type = "button"
    copy.textContent = "Copy"
    copy.addEventListener("mousedown", (e) => {
      e.preventDefault()
      e.stopPropagation()
      request({ type: "copyText", text: this.code })
      copy.textContent = "Copied"
      setTimeout(() => { copy.textContent = "Copy" }, 1200)
    })
    el.append(label, copy)
    // Clicking the language label places the cursor at the end of the fence line.
    label.addEventListener("mousedown", (e) => {
      e.preventDefault()
      e.stopPropagation()
      let pos
      try { pos = view.posAtDOM(el) } catch { return }
      view.dispatch({ selection: { anchor: view.state.doc.lineAt(pos).to } })
      view.focus()
    })
    return el
  }
  ignoreEvent() { return true }
}

export class TocWidget extends WidgetType {
  constructor(headings) { super(); this.headings = headings; this.key = headings.map((h) => h.level + h.text).join("\n") }
  eq(o) { return o.key === this.key }
  toDOM(view) {
    const el = document.createElement("nav")
    el.className = "md-toc markdown-body"
    const title = document.createElement("div")
    title.className = "md-toc-title"
    title.textContent = "Contents"
    el.appendChild(title)
    if (!this.headings.length) {
      const empty = document.createElement("div")
      empty.className = "md-toc-empty"
      empty.textContent = "Add headings to build a table of contents."
      el.appendChild(empty)
    }
    const min = Math.min(...this.headings.map((h) => h.level))
    const ul = document.createElement("ul")
    for (const h of this.headings) {
      const li = document.createElement("li")
      li.className = `md-toc-item md-toc-h${h.level - min + 1}`
      const a = document.createElement("a")
      a.textContent = h.text
      a.addEventListener("mousedown", (e) => {
        e.preventDefault()
        e.stopPropagation()
        const line = view.state.doc.lineAt(Math.min(h.pos, view.state.doc.length))
        view.dispatch({ selection: { anchor: line.to }, effects: scrollToTop(view, line.from) })
        view.focus()
      })
      li.appendChild(a)
      ul.appendChild(li)
    }
    el.appendChild(ul)
    revealOnClick(el, view, 1)
    return el
  }
  ignoreEvent() { return true }
}

let scrollEffectFactory = null
export function setScrollEffectFactory(fn) { scrollEffectFactory = fn }
function scrollToTop(view, pos) { return scrollEffectFactory ? scrollEffectFactory(pos) : [] }

export function sanitizeHTML(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html")
  doc.querySelectorAll("script,iframe,object,embed,link,meta,style,base,form,frame,frameset").forEach((n) => n.remove())
  for (const el of doc.body.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      if (name.startsWith("on") || (/^(href|src|xlink:href|action|formaction)$/.test(name) && /^\s*javascript:/i.test(attr.value))) {
        el.removeAttribute(attr.name)
      }
    }
    if (el.tagName === "IMG" && el.getAttribute("src")) {
      el.setAttribute("src", resolveURL(el.getAttribute("src"), env.baseURL, env.homeURL))
    }
  }
  return doc.body.innerHTML
}

export class HTMLWidget extends WidgetType {
  constructor(html) { super(); this.html = html; this.base = env.baseURL }
  eq(o) { return o.html === this.html && o.base === this.base }
  toDOM(view) {
    const el = document.createElement("div")
    el.className = "md-html-block markdown-body"
    el.innerHTML = sanitizeHTML(this.html)
    el.querySelectorAll("img").forEach((img) => { img.onload = () => view.requestMeasure() })
    revealOnClick(el, view, 1)
    return el
  }
  ignoreEvent() { return true }
}

export class TextWidget extends WidgetType {
  constructor(text, className) { super(); this.text = text; this.className = className }
  eq(o) { return o.text === this.text && o.className === this.className }
  toDOM() {
    const el = document.createElement("span")
    el.className = this.className
    el.textContent = this.text
    return el
  }
  ignoreEvent() { return false }
}
