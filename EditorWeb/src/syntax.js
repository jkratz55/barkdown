// Extra Markdown syntax for the Lezer parser: ==highlight==, $inline math$,
// $$block math$$, YAML front matter and [^footnote] references.
import { tags as t, Tag } from "@lezer/highlight"

export const highlightTag = Tag.define()
export const mathTag = Tag.define()
export const frontMatterTag = Tag.define()
export const footnoteTag = Tag.define()

const Punctuation = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~\xA1‐-‧]/
const space = (ch) => ch === 32 || ch === 9 || ch === 10 || ch === 13 || ch === -1

const HighlightDelim = { resolve: "Highlight", mark: "HighlightMark" }

export const Highlight = {
  defineNodes: [
    { name: "Highlight", style: { "Highlight/...": highlightTag } },
    { name: "HighlightMark", style: t.processingInstruction },
  ],
  parseInline: [{
    name: "Highlight",
    parse(cx, next, pos) {
      if (next !== 61 /* = */ || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61) return -1
      const before = cx.slice(pos - 1, pos), after = cx.slice(pos + 2, pos + 3)
      const sBefore = /\s|^$/.test(before), sAfter = /\s|^$/.test(after)
      const pBefore = Punctuation.test(before), pAfter = Punctuation.test(after)
      return cx.addDelimiter(HighlightDelim, pos, pos + 2,
        !sAfter && (!pAfter || sBefore || pBefore),
        !sBefore && (!pBefore || sAfter || pAfter))
    },
    after: "Emphasis",
  }],
}

export const InlineMath = {
  defineNodes: [
    { name: "InlineMath", style: mathTag },
    { name: "InlineMathMark", style: t.processingInstruction },
  ],
  parseInline: [{
    name: "InlineMath",
    parse(cx, next, pos) {
      if (next !== 36 /* $ */) return -1
      const double = cx.char(pos + 1) === 36
      const open = double ? 2 : 1
      const first = cx.char(pos + open)
      if (space(first) || (!double && first === 36)) return -1
      for (let i = pos + open; i < cx.end; i++) {
        const ch = cx.char(i)
        if (ch === 92 /* \ */) { i++; continue }
        if (ch !== 36) continue
        if (double) {
          if (cx.char(i + 1) !== 36) continue
          return cx.addElement(cx.elt("InlineMath", pos, i + 2, [
            cx.elt("InlineMathMark", pos, pos + 2), cx.elt("InlineMathMark", i, i + 2)]))
        }
        if (space(cx.char(i - 1))) continue
        const after = cx.char(i + 1)
        if (after >= 48 && after <= 57) continue
        return cx.addElement(cx.elt("InlineMath", pos, i + 1, [
          cx.elt("InlineMathMark", pos, pos + 1), cx.elt("InlineMathMark", i, i + 1)]))
      }
      return -1
    },
    before: "Escape",
  }],
}

export const BlockMath = {
  defineNodes: [
    { name: "BlockMath", block: true, style: mathTag },
    { name: "BlockMathMark", style: t.processingInstruction },
  ],
  parseBlock: [{
    name: "BlockMath",
    parse(cx, line) {
      if (line.next !== 36 || line.text.charCodeAt(line.pos + 1) !== 36) return false
      const from = cx.lineStart + line.pos
      const rest = line.text.slice(line.pos + 2)
      const marks = [cx.elt("BlockMathMark", from, from + 2)]
      const closeIdx = rest.lastIndexOf("$$")
      if (closeIdx >= 0 && rest.slice(0, closeIdx).trim() && !rest.slice(closeIdx + 2).trim()) {
        const cs = from + 2 + closeIdx
        marks.push(cx.elt("BlockMathMark", cs, cs + 2))
        const end = cx.lineStart + line.text.length
        cx.nextLine()
        cx.addElement(cx.elt("BlockMath", from, end, marks))
        return true
      }
      if (rest.trim()) return false
      const depth = cx.depth
      while (cx.nextLine() && line.depth >= depth) {
        for (const m of line.markers) marks.push(m)
        if (/^\$\$\s*$/.test(line.text.slice(line.pos))) {
          const s = cx.lineStart + line.pos
          marks.push(cx.elt("BlockMathMark", s, s + 2))
          cx.nextLine()
          break
        }
      }
      cx.addElement(cx.elt("BlockMath", from, cx.prevLineEnd(), marks))
      return true
    },
    before: "FencedCode",
  }],
}

export const FrontMatter = {
  defineNodes: [
    { name: "FrontMatter", block: true, style: frontMatterTag },
    { name: "FrontMatterMark", style: t.processingInstruction },
  ],
  parseBlock: [{
    name: "FrontMatter",
    parse(cx, line) {
      if (cx.lineStart !== 0 || !/^---\s*$/.test(line.text)) return false
      // The Lezer block context keeps its input privately; it's the only way to
      // look ahead more than one line and confirm the block is closed.
      const input = cx.input
      if (!input) return false
      const text = input.read(0, Math.min(input.length, 50000))
      const m = /^---[ \t]*\n(?:[\s\S]*?\n)?(?:---|\.\.\.)[ \t]*(?=\n|$)/.exec(text)
      if (!m) return false
      const end = m[0].length
      const marks = [cx.elt("FrontMatterMark", 0, 3)]
      while (cx.nextLine()) {
        if (cx.lineStart + line.text.length >= end) {
          marks.push(cx.elt("FrontMatterMark", cx.lineStart, cx.lineStart + 3))
          cx.nextLine()
          break
        }
      }
      cx.addElement(cx.elt("FrontMatter", 0, end, marks))
      return true
    },
    before: "HorizontalRule",
  }],
}

export const FootnoteRef = {
  defineNodes: [
    { name: "FootnoteRef", style: footnoteTag },
    { name: "FootnoteMark", style: t.processingInstruction },
    { name: "FootnoteLabel", style: t.labelName },
  ],
  parseInline: [{
    name: "FootnoteRef",
    parse(cx, next, pos) {
      if (next !== 91 /* [ */ || cx.char(pos + 1) !== 94 /* ^ */) return -1
      for (let i = pos + 2; i < cx.end; i++) {
        const ch = cx.char(i)
        if (ch === 93 /* ] */) {
          if (i === pos + 2 || cx.char(i + 1) === 58 /* : */) return -1
          return cx.addElement(cx.elt("FootnoteRef", pos, i + 1, [
            cx.elt("FootnoteMark", pos, pos + 2),
            cx.elt("FootnoteLabel", pos + 2, i),
            cx.elt("FootnoteMark", i, i + 1)]))
        }
        if (space(ch) || ch === 91) return -1
      }
      return -1
    },
    before: "Link",
  }],
}

export function extraSyntax(opts) {
  const ext = [FrontMatter, FootnoteRef]
  if (opts.highlight !== false) ext.push(Highlight)
  if (opts.math !== false) ext.push(InlineMath, BlockMath)
  return ext
}
