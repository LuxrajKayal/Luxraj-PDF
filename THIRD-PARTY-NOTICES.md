# Third-party dependency notices

Luxraj PDF's application, annotation core, and first-party PDF-engine modules are developed for this project. The repository does not bundle the implementation source of the external PDF libraries below; the browser loads them from public CDNs at runtime.

- **PDF.js 5.7.284** — developed by Mozilla and contributors and distributed under the Apache License 2.0. Luxraj PDF imports `pdfjs-dist@5.7.284` from jsDelivr for PDF loading and rendering. See the [official Mozilla PDF.js v5.7.284 release](https://github.com/mozilla/pdf.js/releases/tag/v5.7.284), [source repository](https://github.com/mozilla/pdf.js), and [license](https://github.com/mozilla/pdf.js/blob/v5.7.284/LICENSE).
- **pdf-lib 1.17.1** — distributed under the MIT License and loaded from jsDelivr for the current compatibility export path. See the [source repository and license](https://github.com/Hopding/pdf-lib/blob/master/LICENSE.md).

These notices apply only to the named external dependencies. They do not identify either library as the author of Luxraj PDF's own application or first-party engine code. Luxraj-owned original work is covered by the repository's [LICENSE](LICENSE).

An internet connection is currently required to load these CDN dependencies. The project roadmap tracks replacing them as our own PDF reader, renderer, and source-preserving writer reach sufficient compatibility.
