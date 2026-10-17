// Lazily loads Mermaid (a large script) the first time a diagram is rendered.
import { env } from "./env.js"

let loading = null
let initializedDark = null
let counter = 0
const cache = new Map()

function load() {
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script")
      s.src = "barkdown-mermaid.min.js"
      s.onload = () => resolve(window.mermaid)
      s.onerror = () => { loading = null; reject(new Error("Could not load the diagram renderer.")) }
      document.head.appendChild(s)
    })
  }
  return loading
}

export function diagramCacheKey(code) {
  return (env.dark ? "D:" : "L:") + code
}

export function cachedDiagram(code) {
  return cache.get(diagramCacheKey(code))
}

export async function renderDiagram(code) {
  const key = diagramCacheKey(code)
  if (cache.has(key)) return cache.get(key)
  const mermaid = await load()
  if (initializedDark !== env.dark) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: env.dark ? "dark" : "default",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
    })
    initializedDark = env.dark
  }
  const id = "bd-mermaid-" + (++counter)
  try {
    const { svg } = await mermaid.render(id, code)
    if (cache.size > 200) cache.clear()
    cache.set(key, svg)
    return svg
  } finally {
    document.getElementById(id)?.remove()
    document.getElementById("d" + id)?.remove()
  }
}

export function clearDiagramCache() { cache.clear() }
