// Mutable runtime state shared across editor modules.
export const env = {
  baseURL: null,   // file:// URL of the document's folder, with trailing slash
  homeURL: null,
  dark: false,
  diagrams: true,
  view: null,
}

export function post(message) {
  try { window.webkit?.messageHandlers?.bridge?.postMessage(message) } catch {}
}

export async function request(message) {
  const handler = window.webkit?.messageHandlers?.bridgeReply
  if (!handler) return null
  try { return await handler.postMessage(message) } catch (e) { console.error(e); return null }
}
