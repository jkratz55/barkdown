// Typora-style table editing: GFM tables render as a grid of editable cells
// that write straight back into the Markdown source.
import { WidgetType } from "@codemirror/view"
import { Annotation } from "@codemirror/state"
import { renderInline } from "./render.js"

export const tableEdit = Annotation.define()

// ---------- Parsing & serializing ----------

function splitRow(line) {
  let s = line.trim()
  if (s.startsWith("|")) s = s.slice(1)
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1)
  const cells = []
  let cur = "", inCode = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === "\\" && s[i + 1] === "|") { cur += "\\|"; i++; continue }
    if (ch === "`") inCode = !inCode
    if (ch === "|" && !inCode) { cells.push(cur.trim()); cur = ""; continue }
    cur += ch
  }
  cells.push(cur.trim())
  return cells
}

export function parseTable(src) {
  const lines = src.split("\n").filter((l) => l.trim())
  const rows = lines.map(splitRow)
  const aligns = (rows[1] || []).map((c) => {
    c = c.trim()
    const l = c.startsWith(":"), r = c.endsWith(":")
    return l && r ? "center" : r ? "right" : l ? "left" : null
  })
  const body = [rows[0] || [""], ...rows.slice(2)]
  const cols = Math.max(aligns.length, body[0].length, 1)
  while (aligns.length < cols) aligns.push(null)
  aligns.length = cols
  for (const r of body) { while (r.length < cols) r.push(""); r.length = cols }
  return { aligns, rows: body }
}

const wide = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{1F300}-\u{1FAFF}]/u
function strWidth(s) {
  let w = 0
  for (const ch of s) w += wide.test(ch) ? 2 : 1
  return w
}

export function serializeTable(model) {
  const cols = model.aligns.length
  const rows = model.rows.map((r) => r.map((c) => (c || "").trim()))
  const widths = []
  for (let c = 0; c < cols; c++) widths.push(Math.max(3, ...rows.map((r) => strWidth(r[c]))))
  const pad = (s, w) => s + " ".repeat(Math.max(0, w - strWidth(s)))
  const fmt = (r) => "| " + r.map((cell, c) => pad(cell, widths[c])).join(" | ") + " |"
  const delim = "| " + widths.map((w, c) => {
    const a = model.aligns[c]
    if (a === "center") return ":" + "-".repeat(w - 2) + ":"
    if (a === "right") return "-".repeat(w - 1) + ":"
    if (a === "left") return ":" + "-".repeat(w - 1)
    return "-".repeat(w)
  }).join(" | ") + " |"
  return [fmt(rows[0]), delim, ...rows.slice(1).map(fmt)].join("\n")
}

export function emptyTable(rows, cols) {
  return serializeTable({
    aligns: Array(cols).fill(null),
    rows: Array.from({ length: rows }, () => Array(cols).fill("")),
  })
}

const escapePipes = (s) => s.replace(/(^|[^\\])\|/g, "$1\\|").replace(/(^|[^\\])\|/g, "$1\\|")

// ---------- Icons ----------

const icon = (d) => `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`
const ICONS = {
  left: icon('<path d="M2.5 3.5h11M2.5 6.5h7M2.5 9.5h11M2.5 12.5h7"/>'),
  center: icon('<path d="M2.5 3.5h11M4.5 6.5h7M2.5 9.5h11M4.5 12.5h7"/>'),
  right: icon('<path d="M2.5 3.5h11M6.5 6.5h7M2.5 9.5h11M6.5 12.5h7"/>'),
  rowAbove: icon('<rect x="2.5" y="8.5" width="11" height="5" rx="1"/><path d="M8 2v5M5.5 4.5h5"/>'),
  rowBelow: icon('<rect x="2.5" y="2.5" width="11" height="5" rx="1"/><path d="M8 9v5M5.5 11.5h5"/>'),
  colLeft: icon('<rect x="8.5" y="2.5" width="5" height="11" rx="1"/><path d="M2 8h5M4.5 5.5v5"/>'),
  colRight: icon('<rect x="2.5" y="2.5" width="5" height="11" rx="1"/><path d="M9 8h5M11.5 5.5v5"/>'),
  delRow: icon('<rect x="2.5" y="5.5" width="11" height="5" rx="1"/><path d="M6 8h4"/>'),
  delCol: icon('<rect x="5.5" y="2.5" width="5" height="11" rx="1"/><path d="M8 6v4"/>'),
  trash: icon('<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>'),
}

// ---------- Widget ----------

export class TableWidget extends WidgetType {
  constructor(source) {
    super()
    this.source = source
  }
  eq(other) { return other.source === this.source }
  toDOM(view) {
    const wrap = document.createElement("div")
    wrap.className = "md-table-wrap markdown-body"
    wrap._ctl = new TableController(wrap, view, this)
    return wrap
  }
  updateDOM(dom, view) {
    if (!dom._ctl) return false
    dom._ctl.update(this)
    return true
  }
  get estimatedHeight() { return this.source.split("\n").length * 36 + 8 }
  ignoreEvent() { return true }
}

let pendingFocus = null
export function focusTableAt(pos) { pendingFocus = pos }

class TableController {
  constructor(wrap, view, widget) {
    this.wrap = wrap
    this.view = view
    this.widget = widget
    this.model = parseTable(widget.source)
    this.cur = { r: 0, c: 0 }
    this.build()
    wrap.addEventListener("keydown", (e) => this.onKey(e))
    wrap.addEventListener("input", (e) => this.onInput(e))
    wrap.addEventListener("focusin", (e) => this.onFocusIn(e))
    wrap.addEventListener("focusout", (e) => this.onFocusOut(e))
    if (pendingFocus != null) {
      const want = pendingFocus
      requestAnimationFrame(() => {
        if (this.locate() === want) { pendingFocus = null; this.focusCell(0, 0) }
      })
    }
  }

  build() {
    const { wrap, model } = this
    wrap.textContent = ""
    const bar = document.createElement("div")
    bar.className = "md-table-toolbar"
    bar.setAttribute("contenteditable", "false")
    const btn = (name, title, fn) => {
      const b = document.createElement("button")
      b.type = "button"
      b.className = "md-table-btn md-table-btn-" + name
      b.title = title
      b.innerHTML = ICONS[name]
      b.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); fn() })
      bar.appendChild(b)
      return b
    }
    const sep = () => { const s = document.createElement("span"); s.className = "md-table-sep"; bar.appendChild(s) }
    this.alignButtons = {
      left: btn("left", "Align Left", () => this.align("left")),
      center: btn("center", "Align Center", () => this.align("center")),
      right: btn("right", "Align Right", () => this.align("right")),
    }
    sep()
    btn("rowAbove", "Insert Row Above", () => this.addRow(this.cur.r === 0 ? 1 : this.cur.r, this.cur.r === 0))
    btn("rowBelow", "Insert Row Below", () => this.addRow(this.cur.r + 1))
    btn("colLeft", "Insert Column Left", () => this.addCol(this.cur.c))
    btn("colRight", "Insert Column Right", () => this.addCol(this.cur.c + 1))
    sep()
    btn("delRow", "Delete Row", () => this.deleteRow())
    btn("delCol", "Delete Column", () => this.deleteCol())
    btn("trash", "Delete Table", () => this.deleteTable())
    wrap.appendChild(bar)

    const scroller = document.createElement("div")
    scroller.className = "md-table-scroll"
    const table = document.createElement("table")
    const thead = document.createElement("thead"), tbody = document.createElement("tbody")
    model.rows.forEach((row, r) => {
      const tr = document.createElement("tr")
      row.forEach((raw, c) => {
        const cell = document.createElement(r === 0 ? "th" : "td")
        cell.contentEditable = "plaintext-only"
        cell.spellcheck = true
        cell.dataset.r = r
        cell.dataset.c = c
        if (model.aligns[c]) cell.style.textAlign = model.aligns[c]
        this.renderCell(cell, raw)
        tr.appendChild(cell)
      })
      ;(r === 0 ? thead : tbody).appendChild(tr)
    })
    table.append(thead, tbody)
    scroller.appendChild(table)
    wrap.appendChild(scroller)
    this.updateAlignButtons()
  }

  cell(r, c) { return this.wrap.querySelector(`[data-r="${r}"][data-c="${c}"]`) }

  renderCell(cell, raw) {
    if (document.activeElement === cell) {
      if (cell.textContent !== raw) cell.textContent = raw
    } else {
      cell.innerHTML = raw ? renderInline(raw) : ""
    }
  }

  update(widget) {
    this.widget = widget
    const m = parseTable(widget.source)
    const old = this.model
    const sameShape = m.rows.length === old.rows.length && m.aligns.length === old.aligns.length &&
      m.aligns.every((a, i) => a === old.aligns[i])
    if (!sameShape) {
      const active = this.wrap.contains(document.activeElement)
      this.model = m
      this.cur.r = Math.min(this.cur.r, m.rows.length - 1)
      this.cur.c = Math.min(this.cur.c, m.aligns.length - 1)
      this.build()
      if (active) this.focusCell(this.cur.r, this.cur.c)
      return
    }
    m.rows.forEach((row, r) => row.forEach((raw, c) => {
      if ((old.rows[r][c] || "").trim() !== raw) {
        old.rows[r][c] = raw
        const el = this.cell(r, c)
        if (el) this.renderCell(el, raw)
      }
    }))
  }

  locate() {
    let pos
    try { pos = this.view.posAtDOM(this.wrap) } catch { return null }
    const doc = this.view.state.doc
    if (doc.sliceString(pos, pos + this.widget.source.length) === this.widget.source) return pos
    return null
  }

  commit() {
    const text = serializeTable(this.model)
    if (text === this.widget.source) return
    const from = this.locate()
    if (from == null) return
    this.view.dispatch({
      changes: { from, to: from + this.widget.source.length, insert: text },
      annotations: tableEdit.of(true),
      userEvent: "input.table",
    })
  }

  onInput(e) {
    const cell = e.target.closest?.("th,td")
    if (!cell) return
    const r = +cell.dataset.r, c = +cell.dataset.c
    this.model.rows[r][c] = escapePipes(cell.textContent.replace(/\n/g, " "))
    this.commit()
  }

  onFocusIn(e) {
    const cell = e.target.closest?.("th,td")
    if (!cell) return
    this.wrap.classList.add("md-table-active")
    this.cur = { r: +cell.dataset.r, c: +cell.dataset.c }
    const raw = this.model.rows[this.cur.r][this.cur.c]
    if (cell.textContent !== raw) {
      cell.textContent = raw
      placeCaret(cell, true)
    }
    this.updateAlignButtons()
  }

  onFocusOut(e) {
    const cell = e.target.closest?.("th,td")
    if (cell) {
      const raw = this.model.rows[+cell.dataset.r]?.[+cell.dataset.c] ?? ""
      requestAnimationFrame(() => { if (document.activeElement !== cell) cell.innerHTML = raw ? renderInline(raw) : "" })
    }
    if (!this.wrap.contains(e.relatedTarget)) this.wrap.classList.remove("md-table-active")
  }

  updateAlignButtons() {
    if (!this.alignButtons) return
    const a = this.model.aligns[this.cur.c]
    for (const [k, b] of Object.entries(this.alignButtons)) b.classList.toggle("on", a === k)
  }

  focusCell(r, c, atEnd = true) {
    const el = this.cell(r, c)
    if (!el) return
    el.focus()
    placeCaret(el, atEnd)
  }

  onKey(e) {
    const cell = e.target.closest?.("th,td")
    if (!cell) return
    const r = +cell.dataset.r, c = +cell.dataset.c
    const rows = this.model.rows.length, cols = this.model.aligns.length
    const stop = () => { e.preventDefault(); e.stopPropagation() }
    if (e.key === "Tab") {
      stop()
      if (e.shiftKey) {
        if (c > 0) this.focusCell(r, c - 1)
        else if (r > 0) this.focusCell(r - 1, cols - 1)
      } else if (c < cols - 1) this.focusCell(r, c + 1)
      else if (r < rows - 1) this.focusCell(r + 1, 0)
      else { this.addRow(rows); this.focusCell(rows, 0) }
    } else if (e.key === "Enter") {
      stop()
      if (e.metaKey || e.ctrlKey) { this.addRow(r + 1); this.focusCell(r + 1, c) }
      else if (r < rows - 1) this.focusCell(r + 1, c)
      else this.exit(1)
    } else if (e.key === "ArrowUp" && !e.shiftKey && !e.altKey) {
      stop()
      if (r > 0) this.focusCell(r - 1, c)
      else this.exit(-1)
    } else if (e.key === "ArrowDown" && !e.shiftKey && !e.altKey) {
      stop()
      if (r < rows - 1) this.focusCell(r + 1, c)
      else this.exit(1)
    } else if (e.key === "ArrowLeft" && !e.shiftKey && caretAt(cell, false)) {
      stop()
      if (c > 0) this.focusCell(r, c - 1, true)
      else if (r > 0) this.focusCell(r - 1, cols - 1, true)
      else this.exit(-1)
    } else if (e.key === "ArrowRight" && !e.shiftKey && caretAt(cell, true)) {
      stop()
      if (c < cols - 1) this.focusCell(r, c + 1, false)
      else if (r < rows - 1) this.focusCell(r + 1, 0, false)
      else this.exit(1)
    } else if (e.key === "Escape") {
      stop()
      this.exit(1)
    }
  }

  exit(dir) {
    const from = this.locate()
    if (from == null) return
    const to = from + this.widget.source.length
    const { view } = this
    const doc = view.state.doc
    if (dir < 0) {
      if (from === 0) view.dispatch({ changes: { from: 0, insert: "\n" }, selection: { anchor: 0 } })
      else view.dispatch({ selection: { anchor: from - 1 } })
    } else if (to >= doc.length) {
      view.dispatch({ changes: { from: doc.length, insert: "\n" }, selection: { anchor: doc.length + 1 } })
    } else {
      view.dispatch({ selection: { anchor: to + 1 } })
    }
    view.focus()
  }

  align(a) {
    const c = this.cur.c
    this.model.aligns[c] = this.model.aligns[c] === a ? null : a
    this.restructure(this.cur.r, c)
  }

  addRow(at, header = false) {
    const cols = this.model.aligns.length
    if (header) at = 1
    this.model.rows.splice(Math.max(1, at), 0, Array(cols).fill(""))
    this.restructure(Math.max(1, at), this.cur.c)
  }

  addCol(at) {
    this.model.aligns.splice(at, 0, null)
    for (const row of this.model.rows) row.splice(at, 0, "")
    this.restructure(this.cur.r, at)
  }

  deleteRow() {
    const r = this.cur.r
    if (r === 0) {
      if (this.model.rows.length < 2) return this.deleteTable()
      this.model.rows.shift()
    } else this.model.rows.splice(r, 1)
    this.restructure(Math.min(r, this.model.rows.length - 1), this.cur.c)
  }

  deleteCol() {
    const c = this.cur.c
    if (this.model.aligns.length < 2) return this.deleteTable()
    this.model.aligns.splice(c, 1)
    for (const row of this.model.rows) row.splice(c, 1)
    this.restructure(this.cur.r, Math.min(c, this.model.aligns.length - 1))
  }

  deleteTable() {
    const from = this.locate()
    if (from == null) return
    const to = from + this.widget.source.length
    this.view.dispatch({ changes: { from, to }, selection: { anchor: from }, userEvent: "delete.table" })
    this.view.focus()
  }

  restructure(r, c) {
    this.cur = { r, c }
    // Commit before rebuilding: update() will see a matching shape and keep the DOM.
    const text = serializeTable(this.model)
    const from = this.locate()
    if (from == null) return
    this.build()
    this.view.dispatch({
      changes: { from, to: from + this.widget.source.length, insert: text },
      annotations: tableEdit.of(true),
      userEvent: "input.table",
    })
    this.focusCell(r, c)
  }
}

function placeCaret(el, atEnd) {
  const sel = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(!atEnd)
  sel.removeAllRanges()
  sel.addRange(range)
}

function caretAt(el, end) {
  const sel = window.getSelection()
  if (!sel.rangeCount || !sel.isCollapsed) return false
  const range = sel.getRangeAt(0)
  const probe = document.createRange()
  probe.selectNodeContents(el)
  if (end) probe.setStart(range.endContainer, range.endOffset)
  else probe.setEnd(range.startContainer, range.startOffset)
  return probe.toString().length === 0
}
