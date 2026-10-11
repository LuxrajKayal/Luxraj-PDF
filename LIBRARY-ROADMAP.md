# Luxraj PDF Engine — Development Roadmap

Build the PDF reader, renderer, and writer incrementally. A feature is not a complete PDF implementation until it passes regression tests and works across a representative collection of real PDFs.

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
- Use a compatibility writer for documents the first-party writer cannot safely process

## v0.6 — First-party page renderer (foundation implemented)

File: `luxraj-pdf-renderer.js`

- Canvas rendering for common path, fill, stroke, color, transform, and basic text operators
- Initial ToUnicode CMap text decoding
- Basic image XObjects, opacity, and simple axial/radial patterns
- ASCIIHexDecode and FlateDecode streams without predictors
- Automated tests for paths, text, page sizing, and compressed page content

## v0.7 — Remove PDF.js (completed in this development branch)

The application no longer imports or falls back to PDF.js. It only opens documents that the first-party reader and renderer can process. Unsupported PDFs are reported as unsupported instead of being rendered by an external fallback.

Next: improve coverage through real-document fixtures, especially xref streams, object streams, stream predictors, images and Form XObjects, fonts, clipping, and graphics states. Keep the limitation visible until those cases work.

## v0.8 — Reduce export dependency (in progress)

pdf-lib remains for compatibility export. Remove it only after the first-party writer safely supports the project's target documents and passes regression checks.

## Quality rules

- Write first-party code independently; do not copy implementation code from PDF.js or pdf-lib.
- Keep the PDF engine separate from the browser UI.
- Add a regression test for every fixed defect.
- Never claim general PDF compatibility based on a limited test set.
