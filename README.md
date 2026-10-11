# Luxraj Editor

Luxraj Editor is an independently written browser-based PDF annotation workspace. Its first-party `luxraj-annotation-core.js` module implements annotation creation, drawing, geometry, hit-testing, movement, history, and annotation-state serialization.

The repository also contains `luxraj-pdf-engine.js`, an independently written PDF-engine foundation. It serializes common PDF values, parses a limited subset of PDF syntax and classic cross-reference tables, reads page boxes and directly sized content streams, converts supported annotations into PDF graphics operators, and appends annotation streams to supported existing PDFs without changing their original bytes.

**The browser editor is being migrated to the first-party engine in stages.** The export button now tries the Luxraj writer first for supported PDFs, then temporarily uses pdf-lib as a compatibility fallback when the first-party reader/writer rejects a file or page geometry. PDF.js still handles opening and rendering all PDFs in the current UI. See [LIBRARY-ROADMAP.md](LIBRARY-ROADMAP.md) for the remaining work. No PDF.js or pdf-lib implementation source has been copied into the first-party engine.

## Run locally

The app uses JavaScript modules. PDF.js currently loads from a public CDN for viewing; pdf-lib is dynamically loaded only if the compatibility export fallback is needed. Serve the folder with a local web server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Privacy

PDF files are processed in the browser. The application does not intentionally upload your document to a Luxraj server. PDF.js loads from a public CDN. The temporary pdf-lib fallback is dynamically loaded only when needed. The first-party annotation core and PDF-engine modules run locally and have no third-party runtime dependencies.

## First-party PDF-engine scope

Implemented in `luxraj-pdf-engine.js`:

- PDF syntax value types for names, references, literal strings, and hex strings.
- Serialization and parsing for common values, arrays, dictionaries, comments, and escaped strings.
- Creation of new basic PDFs with classic cross-reference tables and caller-supplied content streams.
- Conversion of supported pen, highlight, rectangle, ellipse, line, arrow, and ASCII-text annotations into PDF graphics operators.
- Reading classic cross-reference tables, indirect objects, page trees, page boxes, and streams whose `/Length` is a direct number.
- An incremental writer that preserves original bytes and adds annotations to supported existing PDFs.
- Automated tests for generated PDF structure, cross-reference offsets, annotation operators, writing, and read-back.

Not implemented yet: xref streams, compressed object streams, indirect stream lengths, encrypted PDFs, general stream-filter decoding, font embedding/Unicode mapping, image/XObject rendering, and broad PDF compatibility. The limited first-party reader is not yet a full replacement for PDF.js.

## Current app scope

The current app still relies on PDF.js to render pages. The export button tries the first-party incremental writer when the source PDF structure and page dimensions are supported. Unsupported PDFs—including files with structures the current engine cannot parse, rotated pages, and unsupported annotation text—use pdf-lib as a temporary compatibility fallback, dynamically loaded only when required. Removing these libraries safely requires completing and testing the reader, renderer, and writer across a corpus of real PDFs.

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
app.js                         Browser UI and PDF workflow
luxraj-annotation-core.js      First-party annotation library
luxraj-pdf-engine.js           First-party PDF syntax, reader, and writer
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
