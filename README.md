# Luxraj Editor

Luxraj Editor is a browser-based PDF annotation workspace. Its annotation system, PDF parser/writer foundation, and new page-rendering foundation are first-party Luxraj code.

## How the editor opens PDFs

1. **Try the Luxraj PDF renderer first.** It parses supported PDFs and draws the supported page operators directly to a Canvas 2D context.
2. **Use compatibility rendering when needed.** While the first-party renderer is incomplete, documents with unsupported file structures or page operators are opened with the existing compatibility renderer so content such as images is not silently omitted.
3. **Annotate and export.** The first-party annotation core powers the annotation tools. Export tries the Luxraj incremental writer first for supported files and uses a compatibility writer for documents outside the writer's supported subset.

The long-term goal is to remove the rendering dependency after our own renderer and reader pass a representative collection of real PDFs. The current first-party renderer is an early implementation, not a complete replacement yet. No PDF.js or pdf-lib implementation source has been copied into Luxraj's code.

## Run locally

Use Node.js 20 or a compatible version with the built-in test runner. From the project folder:

```bash
npm test
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## First-party PDF-engine scope

The code in `luxraj-pdf-engine.js` currently supports common PDF values and serialization, basic PDF creation, and a limited reader for classic cross-reference tables, indirect objects, page trees, page boxes, and directly sized streams. Its incremental writer adds supported annotations while retaining original source bytes and content streams, registers the added text font, and isolates the annotation drawing state from source-page transformations.

The new `luxraj-pdf-renderer.js` module renders a limited subset of page content operators to Canvas: common paths, fills and strokes, color operators, graphics-state save/restore and transforms, basic text using standard fonts, ASCIIHexDecode streams, and FlateDecode streams without predictors.

**Not supported yet:** xref streams, compressed object streams, encrypted PDFs, indirect stream lengths, predictor decoding, images and Form XObjects, inline images, shading, complex font encodings, Unicode font mapping, advanced clipping/graphics states, and many PDF operators. When the first-party path detects unsupported content, the app uses compatibility rendering instead of presenting an incomplete page as if it were correct.

## Privacy and external libraries

PDF files are processed in the browser and are not intentionally uploaded to a Luxraj server. Compatibility rendering/writing still use external libraries loaded from public CDNs while the first-party replacements are developed. Their licensing information remains in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Project files

- `index.html`, `styles.css`, `app.js` — browser interface and app workflow
- `luxraj-annotation-core.js` — first-party annotation model and drawing logic
- `luxraj-pdf-engine.js` — first-party PDF syntax, reader, writer, and annotation export foundation
- `luxraj-pdf-renderer.js` — first-party Canvas renderer foundation
- `tests/` — automated regression tests
- `LIBRARY-ROADMAP.md` — replacement milestones and remaining work

## Ownership and licensing

Original work owned by Luxraj Editor is covered by [LICENSE](LICENSE). Third-party libraries remain under their own licenses as detailed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

GitHub Pages deployment is configured in `.github/workflows/pages.yml`.
