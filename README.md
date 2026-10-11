# Luxraj Editor

Luxraj Editor is a browser-based PDF annotation workspace. Its annotation system, PDF parser/writer foundation, and page renderer are first-party Luxraj code.

## PDF compatibility status

**PDF.js has been removed from the application.** The app now attempts to open and render PDFs using `luxraj-pdf-engine.js` and `luxraj-pdf-renderer.js` only. This is an early, limited renderer and does not yet support every PDF structure or page feature. Some PDFs—including files using xref streams, compressed object streams, encryption, unsupported filters, Form XObjects, complex fonts, or other unimplemented features—will fail to open or render completely. This is an intentional trade-off for this development stage; unsupported content is not sent to a hidden PDF.js fallback.

Export uses the first-party incremental writer only. There is no PDF.js or pdf-lib fallback; if a PDF structure or annotation feature is outside the engine's supported subset, export reports the limitation instead of loading another PDF library.

## Run locally

Use Node.js 20 or a compatible version with the built-in test runner. From the project folder:

```bash
npm test
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## First-party PDF-engine scope

The code in `luxraj-pdf-engine.js` currently supports common PDF values and serialization, basic PDF creation, and a limited reader for classic cross-reference tables, indirect objects, page trees, page boxes, and directly sized streams. Its incremental writer adds supported annotations while retaining original source bytes and content streams.

The `luxraj-pdf-renderer.js` module renders a limited subset of page content operators to Canvas: common paths, fills and strokes, color operators, graphics-state transforms, basic text using standard font names, simple ToUnicode CMaps, basic image XObjects, some graphics-state opacity, simple axial/radial patterns, ASCIIHexDecode, and FlateDecode streams without predictors.

**Not supported yet:** xref streams, compressed object streams, encrypted PDFs, indirect stream lengths, predictor decoding, inline images, Form XObjects, complex font encodings, broad Unicode font mapping, advanced clipping/graphics states, and many PDF operators. If a PDF is unsupported, the app reports that it cannot open the document yet.

## Privacy and external libraries

PDF files are processed locally in the browser and are not intentionally uploaded to a Luxraj server. The current app does not load a third-party JavaScript PDF library. The first-party writer uses incremental updates for the annotation types and PDF structures it supports; unsupported files can fail rather than silently switching to an external library.

## Project files

- `index.html`, `styles.css`, `app.js` — browser interface and app workflow
- `luxraj-annotation-core.js` — first-party annotation model and drawing logic
- `luxraj-pdf-engine.js` — first-party PDF syntax, reader, incremental writer, WinAnsi text encoding, and annotation export
- `luxraj-pdf-renderer.js` — first-party Canvas renderer foundation
- `tests/` — automated regression tests
- `LIBRARY-ROADMAP.md` — replacement milestones and remaining work

## Ownership and licensing

Original work owned by Luxraj Kayal is covered by [LICENSE](LICENSE). The current runtime has no third-party JavaScript PDF dependency. Any future external dependency must be reviewed and recorded in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

GitHub Pages deployment is configured in `.github/workflows/pages.yml`.
