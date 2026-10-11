# Luxraj PDF Library — Development Roadmap

This document describes planned first-party components. Only the annotation core in v0.1 is implemented and tested today; future components are not claimed as complete.

## v0.1 — Annotation Core (implemented)

File: `luxraj-annotation-core.js`

- Annotation creation and color validation
- Geometry, bounds, and hit-testing
- Canvas drawing for pen, highlight, rectangle, ellipse, line, arrow, and text
- Moving annotations
- Bounded undo/redo history
- JSON serialization and validation for annotation state
- No third-party runtime dependencies

## v0.2 — PDF byte/object foundation (planned)

Create a separate first-party module for byte handling, PDF tokens, literal strings, dictionaries, arrays, indirect references, and object serialization. Add tests with small handcrafted fixtures before attempting broader files.

## v0.3 — Minimal PDF writer (planned)

Generate valid PDFs for newly created pages with vector annotations and text using a deliberately limited feature set. This first writer will not automatically preserve arbitrary existing PDF files.

## v0.4 — PDF parser and source preservation (planned)

Implement indirect-object parsing, cross-reference/trailer handling, and supported stream filters. Unknown filters, encrypted files, object streams, unusual font encodings, and malformed files must fail safely rather than produce corrupted output.

## v0.5 — PDF page renderer (planned)

Implement a tested subset of PDF drawing and text operators. General PDF rendering is extensive: image decoding, transparency, fonts, text encodings, page transforms, clipping, and many graphics operators require separate work.

## v1.0 — Reduce and then remove external PDF dependencies (future target)

Only after the internal reader, renderer, and writer pass fixture-based validation across a range of real PDFs should the application stop relying on PDF.js and pdf-lib. Until then, the app uses those separately licensed libraries for PDF reading/rendering/writing. Their notices remain in `THIRD-PARTY-NOTICES.md`.

## Quality requirements

- Every feature must have automated tests.
- Keep PDF fixtures small, redistributable, and locally generated where possible.
- Never claim general PDF compatibility until it has been tested.
- Keep the first-party modules separate from the user interface so they can be tested and reused independently.
