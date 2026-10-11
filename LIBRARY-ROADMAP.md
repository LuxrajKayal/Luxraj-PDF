# Luxraj PDF Engine — Development Roadmap

Build the engine incrementally. A feature is not a replacement for a third-party library until it passes regression tests and works across a representative collection of real PDFs.

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
- Clear rejection of unsupported layouts such as xref streams, compressed object streams, indirect stream lengths, and encrypted PDFs

## v0.5 — Incremental annotation export (implemented for a limited subset)

- Append annotation content while preserving the original source bytes and existing page content streams
- Add a dedicated Helvetica resource for text annotations without overwriting existing font names
- Isolate the annotation drawing state from transformations left by original content streams
- The app attempts this path first for supported, unrotated PDFs; it falls back to pdf-lib for unsupported structures

Remaining work: support more PDF layouts and inherited page structures, improve text encoding, and validate exported files against a real-world fixture collection and independent PDF readers.

## v0.6 — First-party page renderer (future)

Implement and test a subset of PDF operators, then expand to text, paths, images, fonts, transparency, transforms, clipping, and stream filters. Compare the results with trusted PDF readers. This is a substantial project, not just an export fix.

## v1.0 — Reduce external PDF-engine dependencies (future target)

Only remove PDF.js and pdf-lib after the first-party reader, renderer, and writer pass broad fixture-based validation. Until then, the app continues to depend on them for rendering and compatibility exports.

## Quality rules

- Write first-party code independently; do not copy implementation code from PDF.js or pdf-lib.
- Keep the PDF engine separate from the browser UI.
- Add a regression test for every fixed defect.
- Preserve third-party notices while those libraries are used.
- Do not claim general PDF compatibility based on a limited test set.
