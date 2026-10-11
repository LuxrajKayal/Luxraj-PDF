# Luxraj PDF Engine — Development Roadmap

The first-party engine is built incrementally and tested independently. A feature is not considered a replacement for a third-party library until it works against a representative set of real PDFs.

## v0.1 — Annotation core (implemented)

File: `luxraj-annotation-core.js`

- Annotation models, validation, geometry, hit-testing, and canvas drawing
- Moving annotations and bounded undo/redo history
- Annotation-state JSON serialization and validation
- No third-party runtime dependencies

## v0.2 — PDF syntax and minimal writer (implemented foundation)

File: `luxraj-pdf-engine.js`

- First-party PDF name, reference, literal-string, and hex-string value types
- Serializer for common PDF values: names, numbers, booleans, null, arrays, dictionaries, strings, and indirect references
- Parser for those value types, including escaped strings, hex strings, comments, and nested arrays/dictionaries
- Creates new, simple PDF files from caller-supplied page sizes and content-stream operators
- Unit tests verify serialization, parsing errors, content stream lengths, and classic cross-reference offsets

Limitations: this is not yet a full PDF document parser. It does not open arbitrary PDFs, resolve cross-reference/object streams, decode image/font data, handle encryption, or preserve an existing PDF's page content.

## v0.3 — Annotation content generator (next)

Convert our own annotation model into standard PDF graphics operators and create new PDFs containing those annotations. Validate output with independent PDF readers.

## v0.4 — Existing-file object reader

Implement file headers, indirect objects, classic cross-reference tables, trailers, object references, page-tree traversal, and supported stream filters. Reject unsupported or encrypted documents safely.

## v0.5 — Source-preserving writer

Update supported page dictionaries and content streams while retaining existing objects. Validate cross-reference offsets and ensure unmodified source page content remains intact. Add fixtures for common real-world PDFs before using it in the browser app.

## v0.6 — Page renderer

Implement a tested PDF drawing-operator subset and build up text, paths, images, fonts, transparency, transforms, and clipping. The renderer must be compared with trusted readers using a fixture corpus.

## v1.0 — Remove external PDF-engine dependencies

Only after our own reader, renderer, and writer pass fixture-based validation should the browser app stop loading PDF.js and pdf-lib. Until that happens, the app uses those separately licensed libraries for the current full document workflow; their notices must remain accurate.

## Quality and ownership rules

- Write first-party code independently; do not copy implementation code from PDF.js or pdf-lib.
- Keep the PDF engine separate from the browser UI.
- Add automated tests for each supported feature.
- Test output with multiple independent PDF readers where possible.
- Never claim general compatibility when only a limited subset is supported.
