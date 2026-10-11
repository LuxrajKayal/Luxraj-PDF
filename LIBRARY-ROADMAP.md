# Luxraj PDF Engine — Development Roadmap

The first-party engine is being built incrementally and tested independently. A feature is not a replacement for a third-party library until it works against a representative corpus of real PDFs.

## v0.1 — Annotation core (implemented)

File: `luxraj-annotation-core.js`

- Annotation models, validation, geometry, hit-testing, and canvas drawing
- Moving annotations and bounded undo/redo history
- Annotation-state JSON serialization and validation
- No third-party runtime dependencies

## v0.2 — PDF syntax and minimal writer (implemented foundation)

File: `luxraj-pdf-engine.js`

- PDF name, reference, literal-string, and hex-string value types
- Serialization and parsing for common PDF values, comments, escaped strings, arrays, and dictionaries
- New basic PDF documents with classic xref tables and direct-length content streams
- Tested cross-reference offsets, stream lengths, and writer input validation

## v0.3 — Annotation content generator (implemented, limited)

- Convert pen, highlight, rectangle, ellipse, line, arrow, and ASCII text into PDF graphics operators
- Create new PDF files containing annotations on blank pages
- Current limitations: no original-page background is preserved in this mode; no full transparency model or embedded Unicode font support yet

## v0.4 — Existing-file object reader (partial foundation implemented)

- Reads classic xref tables, indirect objects, direct-length streams, trailer/root references, page trees, media boxes, and page content streams
- Can read back the simple PDFs produced by our own writer
- Not yet implemented: xref streams, object streams, indirect stream lengths, encrypted files, and general stream-filter decoding. Unsupported layouts are rejected.

## v0.5 — Source-preserving incremental writer (implemented, limited)

- Append a new annotation content stream to supported existing PDFs and update the page dictionary through an incremental xref section
- Preserve original input bytes rather than rewriting the existing objects
- Tests verify original page content streams remain unchanged and the resulting page tree/content references can be read back
- Current limitations: the source PDF must be parseable by the first-party reader; rotated/cropped page transforms, encryption, complex structure, and some annotation types need additional handling

## v0.6 — First-party page renderer (next)

Implement a tested PDF drawing-operator subset and build up text, paths, images, fonts, transparency, transforms, clipping, and stream filters. Compare output with trusted readers using a fixture corpus. This is a major piece of work and the main blocker to removing PDF.js.

## v1.0 — Remove external PDF-engine dependencies (future target)

The app currently uses PDF.js to read/render pages and dynamically loads pdf-lib only as a temporary export fallback. Only after our own reader, renderer, and source-preserving writer pass fixture-based validation should the app stop loading those libraries. Their notices must remain accurate until they are no longer used.

## Quality and ownership rules

- Write first-party code independently; do not copy implementation code from PDF.js or pdf-lib.
- Keep the PDF engine separate from the browser UI.
- Add automated tests for each supported feature.
- Test output with multiple independent PDF readers where possible.
- Never claim general PDF compatibility when only a limited subset has been tested.
