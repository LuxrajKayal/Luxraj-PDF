# Luxraj Editor

Luxraj Editor is an independently written browser-based PDF annotation workspace. Its first-party `luxraj-annotation-core.js` module implements annotation creation, drawing, geometry, hit-testing, movement, history, and annotation-state serialization.

The repository now contains `luxraj-pdf-engine.js`, an independently written PDF-engine foundation. It serializes common PDF values, parses a limited subset of PDF syntax and classic cross-reference tables, reads page boxes and directly sized content streams, converts supported annotations into PDF graphics operators, and creates simple PDF documents.

**The browser editor still uses PDF.js and pdf-lib for its current open/render/export workflow.** Removing those dependencies before our own reader, renderer, and source-preserving writer are complete would break the main workflow. The replacement work is being developed incrementally; see [LIBRARY-ROADMAP.md](LIBRARY-ROADMAP.md). No PDF.js or pdf-lib implementation source has been copied into the first-party engine.

## Run locally

The app uses JavaScript modules and currently loads its PDF reader/writer from public CDNs. Serve the folder with a local web server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Privacy

PDF files are processed in the browser. The application does not intentionally upload your document to a Luxraj server. The current PDF renderer and writer are fetched from public CDNs. The first-party annotation core and PDF-engine modules run locally and have no third-party runtime dependencies.

## First-party PDF-engine scope

Implemented in `luxraj-pdf-engine.js`:

- PDF syntax value types for names, references, literal strings, and hex strings.
- Serialization and parsing for common values, arrays, dictionaries, comments, and escaped strings.
- Creation of new basic PDFs with classic cross-reference tables and caller-supplied content streams.
- Conversion of supported pen, highlight, rectangle, ellipse, line, arrow, and ASCII-text annotations into PDF drawing operators.
- Reading classic cross-reference tables, indirect objects, page trees, page boxes, and streams whose `/Length` is a direct number.
- Automated tests for generated PDF structure, cross-reference offsets, annotation operators, and read-back of generated files.

Not implemented yet: xref streams, compressed object streams, indirect stream lengths, encrypted PDFs, general stream-filter decoding, font embedding/Unicode mapping, image/XObject rendering, and preserving original page content while editing. The limited first-party reader is not yet connected to the main editor UI and is not a general replacement for PDF.js.

## Current app scope

The current app preserves original page content on export through pdf-lib. The first-party writer creates new PDFs; it does not yet overlay annotations onto existing source files while preserving their contents. Complex or rotated pages, forms, encryption, unusual fonts, image decoding, and broad PDF compatibility need more development and testing.

## First-party annotation core

`luxraj-annotation-core.js` includes annotation creation and color validation, geometry and hit-testing, canvas drawing, movement, bounded undo/redo, and annotation-state serialization/validation.

## Tests

Requires Node.js 20 or another version with the built-in test runner:

```bash
npm test
```

## Project structure

```text
index.html                     Browser interface
app.js                         Browser UI and current PDF workflow
luxraj-annotation-core.js      First-party annotation library
luxraj-pdf-engine.js           First-party PDF syntax, reader, and writer foundation
styles.css                     Application styles
tests/                         Automated tests for first-party modules
LICENSE                        All Rights Reserved for Luxraj-owned original work
THIRD-PARTY-NOTICES.md         Notices for external PDF libraries still in use
LIBRARY-ROADMAP.md             Plan for replacing external PDF-engine dependencies
```

## Ownership and license

Original materials owned by Luxraj Editor are marked **All Rights Reserved** in [LICENSE](LICENSE). Third-party dependencies remain governed by their own licenses; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## GitHub Pages

The project includes a workflow in `.github/workflows/pages.yml` for deploying the site to GitHub Pages from the `main` branch using GitHub Actions.
