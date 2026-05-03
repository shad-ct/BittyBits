# BittyBits — PDF Grid Composer

> **Slides, Condensed.** Turn any PDF into a compact grid handout — entirely in your browser, zero uploads, zero quality loss.

🔗 **Live:** [bitty-bits.netlify.app](https://bitty-bits.netlify.app)

---

## What it does

BittyBits takes a multi-page PDF (lecture slides, presentations, notes) and re-lays it out as a compact grid handout — multiple slides per page, ready to print or share.

```
Input:  60-page slide deck
Output: 4 A4 pages  (3 cols × 5 rows = 15 slides per page)
```

## Features

- **Configurable grid** — choose any combination of columns (1–6) and rows (1–10)
- **Fill order** — Column-first (top→bottom, then next column) or Row-first (left→right, then next row)
- **6 paper sizes** — A4, Letter, and A3 in both portrait and landscape
- **High-quality output** — pages are rendered at 3× resolution before composing; no blurry thumbnails
- **3px gap** between every slide cell for clean visual separation
- **Live preview** — mini grid diagram updates as you change settings; thumbnails of the first 12 slides shown after upload
- **100% client-side** — all processing happens in your browser via [PDF.js](https://mozilla.github.io/pdf.js/) and [pdf-lib](https://pdf-lib.js.org/). No files leave your machine.

## How to use

1. **Configure** the grid layout (columns, rows), fill order, and paper size
2. **Upload** your PDF by dropping it onto the drop zone or clicking to browse
3. **Generate** — click the button and watch the progress bar
4. **Download** the output PDF

## Tech stack

| Layer | Library |
|-------|---------|
| UI | React 19 + TypeScript |
| Bundler | Vite 6 |
| Styling | Vanilla CSS (custom design system) |
| PDF rendering | [pdfjs-dist](https://www.npmjs.com/package/pdfjs-dist) |
| PDF composing | [pdf-lib](https://www.npmjs.com/package/pdf-lib) |

## Running locally

```bash
git clone https://github.com/shad-ct/BittyBits.git
cd BittyBits
npm install
npm run dev       # http://localhost:5173
```

```bash
npm run build     # production build → dist/
npm run preview   # preview production build locally
```

## Output layout (example: 3 × 5, column-first)

```
┌──────────┬──────────┬──────────┐
│ Slide 1  │ Slide 6  │ Slide 11 │
│ Slide 2  │ Slide 7  │ Slide 12 │
│ Slide 3  │ Slide 8  │ Slide 13 │
│ Slide 4  │ Slide 9  │ Slide 14 │
│ Slide 5  │ Slide 10 │ Slide 15 │
└──────────┴──────────┴──────────┘
```

## License

MIT
