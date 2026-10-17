// A floating find & replace bar built on @codemirror/search.
import {
  search, SearchQuery, setSearchQuery, getSearchQuery, findNext, findPrevious,
  replaceNext, replaceAll, closeSearchPanel, openSearchPanel, searchPanelOpen,
} from "@codemirror/search"
import { EditorSelection } from "@codemirror/state"

const ICON = {
  prev: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  chevron: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}

let wantReplace = false

class FindPanel {
  constructor(view) {
    this.view = view
    const q = getSearchQuery(view.state)
    const dom = (this.dom = document.createElement("div"))
    dom.className = "bd-find"
    dom.innerHTML = `
      <div class="bd-find-row">
        <button class="bd-find-toggle-replace" title="Toggle Replace">${ICON.chevron}</button>
        <div class="bd-find-field">
          <input class="bd-find-input" type="text" placeholder="Find" spellcheck="false" autocomplete="off">
          <span class="bd-find-count"></span>
        </div>
        <button class="bd-find-opt" data-opt="caseSensitive" title="Match Case">Aa</button>
        <button class="bd-find-opt" data-opt="wholeWord" title="Whole Word"><u>ab</u></button>
        <button class="bd-find-opt" data-opt="regexp" title="Regular Expression">.*</button>
        <span class="bd-find-divider"></span>
        <button class="bd-find-btn" data-act="prev" title="Previous (⇧⌘G)">${ICON.prev}</button>
        <button class="bd-find-btn" data-act="next" title="Next (⌘G)">${ICON.next}</button>
        <button class="bd-find-btn" data-act="close" title="Close (Esc)">${ICON.close}</button>
      </div>
      <div class="bd-find-row bd-replace-row">
        <span class="bd-find-spacer"></span>
        <div class="bd-find-field"><input class="bd-replace-input" type="text" placeholder="Replace" spellcheck="false" autocomplete="off"></div>
        <button class="bd-find-text-btn" data-act="replace">Replace</button>
        <button class="bd-find-text-btn" data-act="replaceAll">All</button>
      </div>`
    this.input = dom.querySelector(".bd-find-input")
    this.replaceInput = dom.querySelector(".bd-replace-input")
    this.count = dom.querySelector(".bd-find-count")
    this.input.value = q.search
    this.replaceInput.value = q.replace
    this.opts = { caseSensitive: q.caseSensitive, wholeWord: q.wholeWord, regexp: q.regexp }
    this.setReplace(wantReplace)

    dom.querySelectorAll(".bd-find-opt").forEach((b) => {
      b.classList.toggle("on", !!this.opts[b.dataset.opt])
      b.addEventListener("mousedown", (e) => e.preventDefault())
      b.addEventListener("click", () => {
        this.opts[b.dataset.opt] = !this.opts[b.dataset.opt]
        b.classList.toggle("on", this.opts[b.dataset.opt])
        this.commit()
      })
    })
    dom.querySelector(".bd-find-toggle-replace").addEventListener("click", () => this.setReplace(!this.replacing))
    dom.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => this.act(b.dataset.act)))
    this.input.addEventListener("input", () => { this.commit(); this.selectNearest() })
    this.replaceInput.addEventListener("input", () => this.commit())
    dom.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault()
        if (e.target === this.replaceInput) this.act(e.metaKey ? "replaceAll" : "replace")
        else this.act(e.shiftKey ? "prev" : "next")
      } else if (e.key === "Escape") {
        e.preventDefault()
        this.act("close")
      } else if (e.metaKey && (e.key === "g" || e.key === "G")) {
        e.preventDefault()
        this.act(e.shiftKey ? "prev" : "next")
      }
    })
  }

  setReplace(on) {
    this.replacing = on
    this.dom.classList.toggle("bd-find-replacing", on)
  }

  query() {
    return new SearchQuery({ search: this.input.value, replace: this.replaceInput.value, ...this.opts })
  }

  commit() {
    this.view.dispatch({ effects: setSearchQuery.of(this.query()) })
  }

  selectNearest() {
    const q = this.query()
    if (!q.valid) return
    const { state } = this.view
    const from = state.selection.main.from
    const cur = q.getCursor(state, from)
    let m = cur.next()
    if (m.done) m = q.getCursor(state).next()
    if (!m.done) this.view.dispatch({ selection: EditorSelection.single(m.value.from, m.value.to), scrollIntoView: true })
  }

  act(a) {
    const v = this.view
    if (a === "next") findNext(v)
    else if (a === "prev") findPrevious(v)
    else if (a === "replace") replaceNext(v)
    else if (a === "replaceAll") replaceAll(v)
    else if (a === "close") { closeSearchPanel(v); v.focus() }
  }

  updateCount() {
    const q = getSearchQuery(this.view.state)
    if (!q.search || !q.valid) {
      this.count.textContent = q.search && !q.valid ? "Invalid" : ""
      this.dom.classList.toggle("bd-find-none", false)
      return
    }
    const { state } = this.view
    const sel = state.selection.main
    let total = 0, current = 0
    const cur = q.getCursor(state)
    for (let m = cur.next(); !m.done; m = cur.next()) {
      total++
      if (m.value.from === sel.from && m.value.to === sel.to) current = total
      if (total > 9999) break
    }
    this.count.textContent = total ? (current ? `${current} of ${total}` : `${total}`) : "No results"
    this.dom.classList.toggle("bd-find-none", total === 0)
  }

  mount() {
    this.input.focus()
    this.input.select()
    this.updateCount()
  }

  update(u) {
    if (u.docChanged || u.selectionSet || u.transactions.some((t) => t.effects.some((e) => e.is(setSearchQuery)))) {
      const q = getSearchQuery(u.state)
      if (document.activeElement !== this.input && q.search !== this.input.value) this.input.value = q.search
      this.updateCount()
    }
  }

  get top() { return true }
}

export function findExtension() {
  return search({ top: true, createPanel: (view) => new FindPanel(view) })
}

export function openFind(view, replace = false) {
  wantReplace = replace
  if (searchPanelOpen(view.state)) {
    const panel = view.dom.querySelector(".bd-find")
    panel?.classList.toggle("bd-find-replacing", replace || panel.classList.contains("bd-find-replacing"))
    const input = panel?.querySelector(replace ? ".bd-replace-input" : ".bd-find-input")
    input?.focus()
    input?.select()
    return
  }
  // Seed the query from a short single-line selection, like most Mac editors.
  const sel = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)
  if (sel && !sel.includes("\n") && sel.length < 200) {
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ ...queryOpts(view), search: sel })) })
  }
  openSearchPanel(view)
}

function queryOpts(view) {
  const q = getSearchQuery(view.state)
  return { caseSensitive: q.caseSensitive, wholeWord: q.wholeWord, regexp: q.regexp, replace: q.replace }
}

export function useSelectionForFind(view) {
  const sel = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)
  if (!sel) return
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ ...queryOpts(view), search: sel })) })
}

export function findText(view, text) {
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ ...queryOpts(view), search: text })) })
  const q = getSearchQuery(view.state)
  const m = q.getCursor(view.state).next()
  if (!m.done) view.dispatch({ selection: EditorSelection.single(m.value.from, m.value.to), scrollIntoView: true })
}

export { findNext, findPrevious }
