# Luxraj Editor

Luxraj Editor is a browser-based PDF annotation workspace. The annotation model and the developing PDF-engine foundation are first-party Luxraj code.

## How it works today

- **Open and display:** PDF.js renders PDF pages in the browser.
- **Annotate:** the first-party annotation core handles pen strokes, highlights, shapes, lines, arrows, text, hit-testing, movement, and undo/redo.
- **Export:** Luxraj's incremental PDF writer is tried first for supported PDFs. It appends annotation objects while preserving the original file bytes and existing page content. PDFs outside its supported subset use a temporary pdf-lib compatibility fallback.

The first-party PDF engine is **not yet a complete PDF reader or renderer**. Do not remove PDF.js or pdf-lib until the replacement components have been tested against a representative PDF collection. The implementation is written independently; no PDF.js or pdf-lib implementation source has been copied into it.

## Run locally

Use Node.js 20 or a compatible version with the built-in test runner. From the project folder:

```bash
npm test
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## PDF-engine scope

The first-party engine currently supports common PDF values and serialization, basic PDF creation, a limited reader for classic cross-reference tables and indirect objects, and annotation export for pen, highlight, rectangle, ellipse, line, arrow, and ASCII text. For supported input PDFs, it appends content incrementally, registers its own Helvetica resource for added text, and isolates added annotations from transformations left by existing page content.

It is **not a general-purpose PDF implementation**. The incremental path currently rejects encrypted PDFs and does not support xref streams, compressed object streams, indirect stream lengths, rotated pages, or every page-box layout. Text in the first-party writer is limited to ASCII/WinAnsi. Other PDF structures may be sent through the pdf-lib fallback. Both paths still need broader real-document testing.

## Privacy and external libraries

PDFs are handled in the browser and are not intentionally uploaded to a Luxraj server. PDF.js and pdf-lib are loaded from public CDNs; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for their licensing information.

## Project files

- `index.html`, `styles.css`, `app.js` — browser interface and app workflow
- `luxraj-annotation-core.js` — first-party annotation model and drawing logic
- `luxraj-pdf-engine.js` — first-party PDF syntax, reader, and writer foundation
- `tests/` — regression tests
- `LIBRARY-ROADMAP.md` — replacement milestones and remaining work

## Ownership and licensing

Original work owned by Luxraj Editor is covered by [LICENSE](LICENSE). Third-party libraries remain under their own licenses as detailed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

GitHub Pages deployment is configured in `.github/workflows/pages.yml`.
