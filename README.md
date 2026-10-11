# Luxraj Editor

Luxraj Editor is an independently written browser-based PDF annotation workspace. Its first-party `luxraj-annotation-core.js` module implements annotation creation, drawing, geometry, selection hit-testing, movement, undo/redo history, and annotation-state serialization. This module has no third-party runtime dependencies.

The surrounding application currently uses PDF.js to read and render input PDFs and pdf-lib to write annotated PDFs. Replacing those PDF-engine dependencies is a separate engineering project; see [LIBRARY-ROADMAP.md](LIBRARY-ROADMAP.md). The project does not copy source files from the earlier test application.

## Run locally

The app uses JavaScript modules and currently loads PDF.js and pdf-lib from public CDNs. Do not open `index.html` directly from the filesystem; serve the folder with a local web server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## Privacy

PDF files are processed in the browser. The application does not intentionally upload your document to a Luxraj server. The current PDF reader/renderer and PDF writer are fetched from public CDNs. The first-party annotation core itself runs locally and does not depend on those libraries.

## Current scope

Standard, unrotated PDF pages are the primary target for accurate annotation positioning; rotated pages and complex PDF form workflows need additional testing. Export currently preserves the original PDF page content through the external PDF writer. The first-party annotation library is tested independently with Node's built-in test runner.

## First-party annotation library

`luxraj-annotation-core.js` exports:

- `createAnnotation` and `normalizeHexColor`
- `annotationBounds` and `findAnnotationAt`
- `translateAnnotation`
- `drawAnnotation` and `renderAnnotationLayer`
- `AnnotationHistory`
- `serializeAnnotationState` and `parseAnnotationState`

The public APIs are dependency-free ES modules, so they can be reused internally by other Luxraj components without importing the page UI.

## Tests

Requires Node.js 20 or another version that supports `node:test`:

```bash
npm test
```

## Project structure

```text
index.html                     Browser interface
app.js                         Browser UI and PDF workflow
luxraj-annotation-core.js      First-party annotation library
styles.css                     Application styles
tests/annotation-core.test.mjs Automated tests
LICENSE                        All Rights Reserved for Luxraj-owned original work
THIRD-PARTY-NOTICES.md         Notices for external PDF libraries
LIBRARY-ROADMAP.md             Plan for replacing external PDF-engine dependencies
```

## Ownership and license

Original materials owned by Luxraj Editor are marked **All Rights Reserved** in [LICENSE](LICENSE). The public source can be read or downloaded for inspection and reference, but that is not permission to reuse, modify, redistribute, or deploy Luxraj-owned source. Third-party dependencies remain governed by their own licenses; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## GitHub Pages

The project includes a workflow in `.github/workflows/pages.yml` for deploying the site to GitHub Pages from the `main` branch using GitHub Actions.
