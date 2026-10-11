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
- Current limitations: no original-page background is preserved; no real transparency model or embedded Unicode font support yet

## v0.4 — Existing-file object reader (partial foundation implemented)

- Reads classic xref tables, indirect objects, direct-length streams, trailer/root references, page trees, media boxes, and page content streams
- Can read back the simple PDFs produced by our own writer
- Not yet implemented: xref streams, object streams, indirect stream lengths, encrypted files, and general stream-filter decoding. Unsupported layouts fail with an error rather than being advertised as supported.

## v0.5 — Source-preserving writer (next)

Update supported page dictionaries and content streams while retaining existing objects. Validate cross-reference offsets and ensure unmodified source page content remains intact. Add fixtures from common real-world PDFs before using it in the editor.

## v0.6 — Page renderer (next)

Implement a tested PDF drawing-operator subset and build up text, paths, images, fonts, transparency, transforms, clipping, and stream filters. Compare output with trusted readers using a fixture corpus. This is a major piece of work.

## v1.0 — Remove external PDF-engine dependencies (future target)

Only after our own reader, renderer, and source-preserving writer pass fixture-based validation should the browser app stop loading PDF.js and pdf-lib. Until that happens, the app still uses those separately licensed libraries for its current full document workflow, and their notices must remain accurate.

## Quality and ownership rules

- Write first-party code independently; do not copy implementation code from PDF.js or pdf-lib.
- Keep the PDF engine separate from the browser UI.
- Add automated tests for each supported feature.
- Test output with multiple independent PDF readers where possible.
- Never claim general PDF compatibility when only a limited subset has been tested.
