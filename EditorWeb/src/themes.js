// Built-in themes. Each one overrides the variables declared in document.css
// and may add a few rules of its own.

const dark = `
  --bd-scheme: dark;
  --bd-panel-bg: rgba(40, 42, 48, 0.9);
  --bd-panel-border: rgba(255, 255, 255, 0.1);
  --bd-shadow: 0 10px 34px rgba(0, 0, 0, 0.45), 0 1px 3px rgba(0, 0, 0, 0.3);
`

export const THEMES = {
  barkdown: {
    name: "Barkdown",
    dark: false,
    css: `:root { }`,
  },

  "barkdown-dark": {
    name: "Barkdown Dark",
    dark: true,
    css: `:root {
      ${dark}
      --bd-bg: #1c1d21;
      --bd-fg: #d9dbe0;
      --bd-muted: #9196a1;
      --bd-faint: #626772;
      --bd-accent: #8b8cf8;
      --bd-selection: rgba(139, 140, 248, 0.28);
      --bd-border: #2f3137;
      --bd-code-bg: #25262b;
      --bd-code-fg: #d4d6dc;
      --bd-inline-code-bg: rgba(255, 255, 255, 0.08);
      --bd-inline-code-fg: #f0a57a;
      --bd-quote-border: #3d4048;
      --bd-quote-fg: #a3a8b3;
      --bd-mark-bg: rgba(250, 204, 21, 0.3);
      --bd-table-border: #33353c;
      --bd-table-header-bg: #24252a;
      --bd-table-stripe: #202125;
      --bd-hr: #33353c;
      --bd-heading-color: #f1f2f5;
      --tok-keyword: #c4a7ff;
      --tok-string: #8bd5a6;
      --tok-number: #f5b36e;
      --tok-comment: #6f7581;
      --tok-function: #82b1ff;
      --tok-type: #6fd3e4;
      --tok-property: #93b4ff;
      --tok-operator: #a3a8b3;
      --tok-tag: #f28bb3;
      --tok-attr: #f5b36e;
      --tok-meta: #9196a1;
    }`,
  },

  github: {
    name: "GitHub",
    dark: false,
    css: `:root {
      --bd-fg: #1f2328;
      --bd-muted: #59636e;
      --bd-faint: #9198a1;
      --bd-accent: #0969da;
      --bd-selection: rgba(9, 105, 218, 0.18);
      --bd-border: #d1d9e0;
      --bd-code-bg: #f6f8fa;
      --bd-code-fg: #1f2328;
      --bd-inline-code-bg: rgba(129, 139, 152, 0.12);
      --bd-inline-code-fg: #1f2328;
      --bd-quote-border: #d1d9e0;
      --bd-quote-fg: #59636e;
      --bd-mark-bg: #fff8c5;
      --bd-table-border: #d1d9e0;
      --bd-table-header-bg: #f6f8fa;
      --bd-table-stripe: #f6f8fa;
      --bd-hr: #d1d9e0;
      --bd-heading-color: #1f2328;
      --bd-heading-weight: 600;
      --bd-heading-spacing: 0;
      --bd-h1-size: 2em;
      --bd-h2-size: 1.5em;
      --bd-h1-border: 1px solid #d1d9e0b3;
      --bd-h2-border: 1px solid #d1d9e0b3;
      --bd-line-height: 1.6;
      --bd-radius: 6px;
      --tok-keyword: #cf222e;
      --tok-string: #0a3069;
      --tok-number: #0550ae;
      --tok-comment: #59636e;
      --tok-function: #8250df;
      --tok-type: #953800;
      --tok-property: #0550ae;
      --tok-operator: #1f2328;
      --tok-tag: #116329;
      --tok-attr: #0550ae;
    }
    .markdown-body table { border-radius: 0; }
    .cm-line.md-h1, .cm-line.md-h2 { padding-bottom: 0.3em; margin-bottom: 0.2em; }`,
  },

  "github-dark": {
    name: "GitHub Dark",
    dark: true,
    css: `:root {
      ${dark}
      --bd-bg: #0d1117;
      --bd-fg: #e6edf3;
      --bd-muted: #9198a1;
      --bd-faint: #656c76;
      --bd-accent: #4493f8;
      --bd-selection: rgba(68, 147, 248, 0.3);
      --bd-border: #3d444d;
      --bd-code-bg: #151b23;
      --bd-code-fg: #e6edf3;
      --bd-inline-code-bg: rgba(101, 108, 118, 0.25);
      --bd-inline-code-fg: #e6edf3;
      --bd-quote-border: #3d444d;
      --bd-quote-fg: #9198a1;
      --bd-mark-bg: rgba(187, 128, 9, 0.4);
      --bd-table-border: #3d444d;
      --bd-table-header-bg: #151b23;
      --bd-table-stripe: #151b23;
      --bd-hr: #3d444d;
      --bd-heading-color: #e6edf3;
      --bd-heading-weight: 600;
      --bd-heading-spacing: 0;
      --bd-h1-border: 1px solid #3d444db3;
      --bd-h2-border: 1px solid #3d444db3;
      --bd-line-height: 1.6;
      --bd-radius: 6px;
      --tok-keyword: #ff7b72;
      --tok-string: #a5d6ff;
      --tok-number: #79c0ff;
      --tok-comment: #9198a1;
      --tok-function: #d2a8ff;
      --tok-type: #ffa657;
      --tok-property: #79c0ff;
      --tok-operator: #e6edf3;
      --tok-tag: #7ee787;
      --tok-attr: #79c0ff;
    }
    .markdown-body table { border-radius: 0; }`,
  },

  newsprint: {
    name: "Newsprint",
    dark: false,
    css: `:root {
      --bd-bg: #f3f2ee;
      --bd-fg: #1f0909;
      --bd-muted: #6b5d5d;
      --bd-faint: #a99c94;
      --bd-accent: #065588;
      --bd-selection: rgba(6, 85, 136, 0.18);
      --bd-border: #d8d2c6;
      --bd-code-bg: #e9e6dd;
      --bd-code-fg: #1f0909;
      --bd-inline-code-bg: #e5e1d5;
      --bd-inline-code-fg: #1f0909;
      --bd-quote-border: #c5bba8;
      --bd-quote-fg: #4d3c3c;
      --bd-mark-bg: #f5e7a3;
      --bd-table-border: #cfc7b8;
      --bd-table-header-bg: #e9e6dd;
      --bd-table-stripe: #efede7;
      --bd-hr: #c5bba8;
      --bd-font-body: "PT Serif", Charter, "Iowan Old Style", Georgia, "Times New Roman", serif;
      --bd-font-heading: "PT Serif", Charter, Georgia, serif;
      --bd-heading-color: #1f0909;
      --bd-heading-weight: 700;
      --bd-heading-spacing: 0;
      --bd-line-height: 1.6;
      --bd-h1-size: 1.9em;
      --bd-h2-size: 1.45em;
      --bd-h3-size: 1.2em;
      --bd-radius: 2px;
    }
    .cm-line.md-h1, .markdown-body h1 { text-align: center; font-weight: 400; letter-spacing: 0.02em; }
    .cm-line.md-h2, .markdown-body h2 { font-style: italic; font-weight: 400; }
    .markdown-body blockquote, .cm-line.md-quote { font-style: italic; }`,
  },

  night: {
    name: "Night",
    dark: true,
    css: `:root {
      ${dark}
      --bd-bg: #363b40;
      --bd-fg: #b8bfc6;
      --bd-muted: #9aa1a8;
      --bd-faint: #6d747b;
      --bd-accent: #e0e0e0;
      --bd-link: #e0e0e0;
      --bd-selection: rgba(255, 255, 255, 0.16);
      --bd-border: #474d54;
      --bd-code-bg: #333438;
      --bd-code-fg: #d4d8dc;
      --bd-inline-code-bg: #4a4f55;
      --bd-inline-code-fg: #e8e8e8;
      --bd-quote-border: #474d54;
      --bd-quote-fg: #9aa1a8;
      --bd-mark-bg: #a8a8a9;
      --bd-mark-fg: #1f1f1f;
      --bd-table-border: #474d54;
      --bd-table-header-bg: #3f4449;
      --bd-table-stripe: #3a3f44;
      --bd-hr: #474d54;
      --bd-heading-color: #dedede;
      --bd-font-body: "Helvetica Neue", Helvetica, Arial, sans-serif;
      --bd-heading-weight: 700;
      --bd-panel-bg: rgba(54, 59, 64, 0.94);
      --tok-keyword: #cc99cd;
      --tok-string: #7ec699;
      --tok-number: #f08d49;
      --tok-comment: #8d939a;
      --tok-function: #f8c555;
      --tok-type: #67cdcc;
      --tok-property: #f8c555;
      --tok-operator: #b8bfc6;
      --tok-tag: #e2777a;
      --tok-attr: #f8c555;
    }
    .cm-line.md-h1, .markdown-body h1 { letter-spacing: 0.02em; }
    .md-checkbox.checked { color: #363b40; }`,
  },

  pixyll: {
    name: "Pixyll",
    dark: false,
    css: `:root {
      --bd-fg: #333333;
      --bd-muted: #707070;
      --bd-faint: #a8a8a8;
      --bd-accent: #0d6efd;
      --bd-link: #0076df;
      --bd-border: #e8e8e8;
      --bd-code-bg: #f5f6f7;
      --bd-inline-code-bg: #f5f6f7;
      --bd-inline-code-fg: #333;
      --bd-quote-border: #333;
      --bd-quote-fg: #555;
      --bd-font-body: Merriweather, "Iowan Old Style", Charter, Georgia, serif;
      --bd-font-heading: Lato, "Helvetica Neue", Helvetica, sans-serif;
      --bd-heading-color: #222;
      --bd-heading-weight: 700;
      --bd-heading-spacing: -0.01em;
      --bd-line-height: 1.8;
      --bd-h1-size: 2.4em;
      --bd-h2-size: 1.7em;
      --bd-h3-size: 1.35em;
      --bd-content-width: 720px;
    }
    .cm-line.md-quote, .markdown-body blockquote { font-style: italic; border-left-width: 5px; }`,
  },

  whitey: {
    name: "Whitey",
    dark: false,
    css: `:root {
      --bd-fg: #222222;
      --bd-muted: #777;
      --bd-faint: #b0b0b0;
      --bd-accent: #222;
      --bd-link: #222;
      --bd-selection: rgba(0, 0, 0, 0.1);
      --bd-border: #eee;
      --bd-code-bg: #fafafa;
      --bd-inline-code-bg: #f4f4f4;
      --bd-inline-code-fg: #444;
      --bd-quote-border: #ddd;
      --bd-quote-fg: #666;
      --bd-mark-bg: #eee;
      --bd-font-body: Vollkorn, Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif;
      --bd-font-heading: Vollkorn, Palatino, Georgia, serif;
      --bd-heading-color: #222;
      --bd-heading-weight: 400;
      --bd-heading-spacing: 0.01em;
      --bd-line-height: 1.75;
      --bd-font-size: 17px;
    }
    .cm-line.md-h1, .markdown-body h1 { text-align: center; font-size: 2.3em; }
    .cm-line.md-h2, .markdown-body h2 { font-style: italic; }
    .md-link, .markdown-body a { text-decoration-color: #bbb; }`,
  },

  solarized: {
    name: "Solarized",
    dark: false,
    css: `:root {
      --bd-bg: #fdf6e3;
      --bd-fg: #586e75;
      --bd-muted: #839496;
      --bd-faint: #a9b5b3;
      --bd-accent: #268bd2;
      --bd-selection: rgba(38, 139, 210, 0.18);
      --bd-border: #e9e1c8;
      --bd-code-bg: #eee8d5;
      --bd-code-fg: #586e75;
      --bd-inline-code-bg: #eee8d5;
      --bd-inline-code-fg: #cb4b16;
      --bd-quote-border: #d33682;
      --bd-quote-fg: #657b83;
      --bd-mark-bg: #f3e2a2;
      --bd-table-border: #e3dbc2;
      --bd-table-header-bg: #eee8d5;
      --bd-table-stripe: #f8f0da;
      --bd-hr: #e3dbc2;
      --bd-heading-color: #073642;
      --tok-keyword: #859900;
      --tok-string: #2aa198;
      --tok-number: #d33682;
      --tok-comment: #93a1a1;
      --tok-function: #268bd2;
      --tok-type: #b58900;
      --tok-property: #268bd2;
      --tok-operator: #657b83;
      --tok-tag: #dc322f;
      --tok-attr: #b58900;
    }`,
  },

  nord: {
    name: "Nord",
    dark: true,
    css: `:root {
      ${dark}
      --bd-bg: #2e3440;
      --bd-fg: #d8dee9;
      --bd-muted: #a3acbd;
      --bd-faint: #6b7487;
      --bd-accent: #88c0d0;
      --bd-selection: rgba(136, 192, 208, 0.25);
      --bd-border: #3b4252;
      --bd-code-bg: #3b4252;
      --bd-code-fg: #e5e9f0;
      --bd-inline-code-bg: #3b4252;
      --bd-inline-code-fg: #ebcb8b;
      --bd-quote-border: #5e81ac;
      --bd-quote-fg: #a3acbd;
      --bd-mark-bg: rgba(235, 203, 139, 0.35);
      --bd-table-border: #434c5e;
      --bd-table-header-bg: #3b4252;
      --bd-table-stripe: #323946;
      --bd-hr: #434c5e;
      --bd-heading-color: #eceff4;
      --bd-panel-bg: rgba(46, 52, 64, 0.94);
      --tok-keyword: #81a1c1;
      --tok-string: #a3be8c;
      --tok-number: #b48ead;
      --tok-comment: #616e88;
      --tok-function: #88c0d0;
      --tok-type: #8fbcbb;
      --tok-property: #88c0d0;
      --tok-operator: #81a1c1;
      --tok-tag: #81a1c1;
      --tok-attr: #8fbcbb;
    }
    .md-checkbox.checked { color: #2e3440; }`,
  },
}

export function themeInfo() {
  return Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name, dark: t.dark }))
}
