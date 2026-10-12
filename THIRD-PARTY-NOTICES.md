# Third-party dependency notices

Luxraj Editor loads the following libraries from public CDNs at runtime. Their implementation source is not bundled in this repository; each library remains under its own license.

- **PDF.js 5.7.284** — developed by Mozilla and contributors; Apache License 2.0. The app loads `pdfjs-dist@5.7.284` from jsDelivr. See the [official Mozilla PDF.js v5.7.284 release](https://github.com/mozilla/pdf.js/releases/tag/v5.7.284), [source repository](https://github.com/mozilla/pdf.js), and [license](https://github.com/mozilla/pdf.js/blob/v5.7.284/LICENSE).
- **pdf-lib 1.17.1** — MIT License: https://github.com/Hopding/pdf-lib/blob/master/LICENSE.md.

## Provenance clarification

The bundled `vendor/pdf.min.mjs` present in the original [mikispag/pdf-editor repository](https://github.com/mikispag/pdf-editor) is a PDF.js build whose embedded version string is **4.10.38**. Its source header explicitly says **Copyright 2024 Mozilla Foundation** and identifies the Apache License 2.0. That PDF.js code is Mozilla's project code, not the original editor author's own library.

In the temporary Luxraj `pdf-annotation-test` repository, `vendor/pdf.min.mjs` was later replaced with a short CDN shim that re-exports PDF.js 5.7.284; it is not the original 4.10.38 implementation bundle. In the current `Luxraj-PDF` repository, `app.js` imports PDF.js 5.7.284 directly from jsDelivr. Therefore, there is no bundled PDF.js source file in the current repository whose internal author header needs editing.

The separate editor application code is adapted from the MIT-licensed [mikispag/pdf-editor project](https://github.com/mikispag/pdf-editor); that attribution and its MIT notice remain relevant to the adapted application code. This does not make PDF.js the editor author's property.

These dependency licenses apply to their respective libraries, not to Luxraj Editor's separately authored code. An internet connection is required to load the CDN dependencies.
