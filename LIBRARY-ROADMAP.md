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

- Classic xref tables and supported xref streams, indirect objects, trailers, page trees, page boxes, and directly sized content streams
- This milestone originally supported classic tables only; xref-stream/object-stream support is tracked in v0.9 below. Indirect stream lengths and encrypted PDFs remain unsupported

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

Next: improve coverage through real-document fixtures, especially page-stream predictors, images and Form XObjects, fonts, clipping, and graphics states. Keep limitations visible until those cases work.

## v0.8 — First-party annotation export (current scope implemented)

- Removed the pdf-lib compatibility fallback and its CDN import.
- Export now uses the Luxraj incremental writer only and reports unsupported cases instead of silently passing them to another library.
- The writer registers PDF transparency graphics states for annotation opacity and encodes common Windows-1252 text using the built-in Helvetica/WinAnsi font.
- The current engine still supports only a subset of existing PDFs. This milestone replaces the specific annotation-export dependency; it does not claim to reproduce the whole pdf-lib API or all PDF features.

Next: broaden page-rendering coverage (page-stream predictors, images and Form XObjects, fonts, clipping, and graphics states), add proper Unicode font embedding, and test against representative real-world PDFs.


## v0.9 — Xref streams and compressed object streams (implemented, limited)

- The structural reader can parse classic xref tables, standalone xref streams, and hybrid-reference tables with XRefStm sections.
- Xref/object streams support FlateDecode and PNG predictors 10–15; the TIFF predictor currently supports 8-bit components only.
- Objects indexed inside ObjStm streams are materialized before page-tree traversal.
- Parser and incremental writer calls are asynchronous to support the browser's built-in stream decompression API; no third-party PDF library was added.
- Regression tests build a small compressed PDF fixture that exercises xref-stream decoding, PNG predictor handling, compressed page-tree objects, and page-tree traversal.
- Not a claim of full PDF compatibility: indirect stream lengths, encryption, other structural filters, and several page-renderer features remain unsupported. The uploaded sample PDF uses a classic xref table, so it does not by itself reproduce the screenshot's xref-stream error.

## Quality rules

- Write first-party code independently; do not copy implementation code from PDF.js or pdf-lib.
- Keep the PDF engine separate from the browser UI.
- Add a regression test for every fixed defect.
- Never claim general PDF compatibility based on a limited test set.
