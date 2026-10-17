// Bundles the editor into Barkdown/Editor so Xcode ships it as app resources.
import * as esbuild from "esbuild"
import fs from "node:fs"
import path from "node:path"

const out = path.resolve("../Barkdown/Editor")
fs.mkdirSync(out, { recursive: true })
const watch = process.argv.includes("--watch")

// KaTeX's stylesheet with only its WOFF2 fonts, inlined as data URIs.
const katexCSS = {
  name: "katex-css",
  setup(build) {
    build.onResolve({ filter: /^virtual:katex-css$/ }, () => ({ path: "katex-css", namespace: "virtual" }))
    build.onLoad({ filter: /.*/, namespace: "virtual" }, () => {
      const dir = path.resolve("node_modules/katex/dist")
      let css = fs.readFileSync(path.join(dir, "katex.min.css"), "utf8")
      css = css.replace(/,url\(fonts\/[^)]+\.(woff|ttf)\) format\("(woff|truetype)"\)/g, "")
      css = css.replace(/url\(fonts\/([^)]+\.woff2)\)/g, (_, f) =>
        `url(data:font/woff2;base64,${fs.readFileSync(path.join(dir, "fonts", f)).toString("base64")})`)
      return { contents: css, loader: "text" }
    })
  },
}

const options = {
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  target: ["safari17"],
  minify: !watch,
  legalComments: "none",
  outfile: path.join(out, "barkdown-editor.js"),
  loader: { ".css": "text" },
  plugins: [katexCSS],
  logLevel: "info",
}

fs.copyFileSync("node_modules/mermaid/dist/mermaid.min.js", path.join(out, "barkdown-mermaid.min.js"))
fs.writeFileSync(path.join(out, "barkdown-editor.html"), `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Barkdown</title>
</head>
<body>
<div id="editor"></div>
<script src="barkdown-editor.js"></script>
</body>
</html>
`)

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
} else {
  await esbuild.build(options)
}
