# Luxraj PDF Engine — Development Roadmap

Build the PDF reader, renderer, and writer incrementally. A feature is not a replacement for a third-party library until it passes regression tests and works across a representative collection of real PDFs.

## v0.1 — Annotation core (implemented)

File: `luxraj-annotation-core.js`

- Annotation validation, geometry, hit-testing, rendering, movement, and bounded undo/redo
- Annotation-state serialization and validation
- No third-party runtime dependencies

## v0.2 — PDF syntax and minimal writer (foundation implemented)

File: `luxraj-pdf-engine.js`

- PDF names, references, literal strings, and hex strings
- Serialization and parsing of common values, arrays, dictionaries, comments, and escaped strings
- Basic PDF creation with classic cross-reference tables and direct-length streams

## v0.3 — Annotation content generator (implemented, limited)

- PDF graphics operators for pen, highlight, rectangle, ellipse, line, arrow, and ASCII text
- Basic annotation-only PDFs on blank pages
- No Unicode font embedding or full transparency model in the first-party writer

## v0.4 — Existing-file reader (partial foundation implemented)

- Classic xref tables, indirect objects, trailers, page trees, page boxes, and directly sized content streams
- Unsupported layouts such as xref streams, compressed object streams, indirect stream lengths, and encrypted PDFs are not yet supported

## v0.5 — Incremental annotation export (implemented for a limited subset)

- Append annotation content while preserving original source bytes and existing page content streams
- Register a dedicated Helvetica resource for added text
- Isolate annotation drawing from transformations left by original page content
- Use a compatibility writer for documents the first-party writer cannot safely process

## v0.6 — First-party page renderer (foundation implemented)

File: `luxraj-pdf-renderer.js`

- Canvas rendering for common path, fill, stroke, color, and transform operators
- Basic text display using standard font names and text matrices
- ASCIIHexDecode and FlateDecode streams without predictors
- Automated tests for paths, text, page sizing, and unsupported operators

Next work: implement Form and Image XObjects, more graphics-state operators and clipping, wider text/font handling, predictors and more stream filters; add a fixture corpus from real documents including browser-printed course PDFs. Extend PDF file parsing for xref streams, compressed object streams, and indirect stream lengths.

## v0.7 — Renderer integration and compatibility reduction (in progress)

The app now tries the first-party reader and renderer first for documents within the supported subset. If a document uses an unsupported structure or page operator, it falls back to compatibility rendering so the user does not silently lose page content.

Next: expand coverage until fallback is rare for the project's target PDFs. Compare each rendered page against established readers and retain regression fixtures for defects.

## v1.0 — Remove external PDF-engine dependencies (future target)

Remove the rendering library only after the first-party parser and renderer pass broad fixture-based validation, including the PDFs the project owner actually uses. Remove the compatibility writer separately after the first-party writer supports those documents. Do not remove a dependency merely because a basic sample PDF renders.

## Quality rules

- Write first-party code independently; do not copy implementation code from PDF.js or pdf-lib.
- Keep the PDF engine separate from the browser UI.
- Add a regression test for every fixed defect.
- Keep third-party notices accurate while the app still uses external libraries.
- Never claim general PDF compatibility based on a limited test set.
