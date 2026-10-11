# Luxraj Editor

Luxraj Editor is an independently written browser-based PDF annotation workspace. Its first-party `luxraj-annotation-core.js` module implements annotation creation, drawing, geometry, hit-testing, movement, history, and annotation-state serialization.

The repository now also contains `luxraj-pdf-engine.js`, an independently written PDF syntax and minimal PDF-writer foundation. It serializes common PDF values, parses a limited subset of PDF syntax, and creates small new PDFs from supplied page sizes and content operators. It is not yet a general-purpose reader and cannot preserve arbitrary existing PDF files.

**The browser editor still uses PDF.js and pdf-lib for its current open/render/export workflow.** Removing those dependencies before our own reader, renderer, and source-preserving writer are complete would break the main workflow. The replacement work is being done incrementally; see [LIBRARY-ROADMAP.md](LIBRARY-ROADMAP.md). No PDF.js or pdf-lib implementation source has been copied into the first-party engine.

## Run locally

The app uses JavaScript modules and currently loads its PDF reader/writer from public CDNs. Serve the folder with a local web server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Privacy

PDF files are processed in the browser. The application does not intentionally upload your document to a Luxraj server. The current PDF renderer and writer are fetched from public CDNs. The first-party annotation core and PDF-engine foundation run locally and have no third-party runtime dependencies.

## Current scope

The current app preserves original page content on export by using an external PDF writer. The first-party writer currently creates new basic PDF files only; it does not edit existing files. Complex and rotated pages, forms, encryption, unusual fonts, image decoding, and broad PDF compatibility require further work and testing.

## First-party modules

`luxraj-annotation-core.js` includes:

- Annotation creation and color validation
- Geometry, bounds, hit-testing, canvas drawing, and movement
- Undo/redo history
- Annotation-state serialization and validation

`luxraj-pdf-engine.js` includes:

- PDF value types for names, references, literal strings, and hex strings
- Serialization of common PDF values and dictionaries
- Parsing of a limited PDF syntax subset
- A minimal writer for creating new PDF documents from supplied content streams

These are independent ES modules and can be tested without the browser UI or external PDF libraries.

## Tests

Requires Node.js 20 or another version with the built-in test runner:

```bash
npm test
```

## Project structure

```text
index.html                     Browser interface
app.js                         Browser UI and existing PDF workflow
luxraj-annotation-core.js      First-party annotation library
luxraj-pdf-engine.js           First-party PDF syntax and minimal writer
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
