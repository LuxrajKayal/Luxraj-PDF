# Third-party dependency notices

The browser app currently uses the following external libraries. Their source code is not copied into this repository, and each remains under its own license.

- **PDF.js 5.7.284** — Apache License 2.0: https://github.com/mozilla/pdf.js/blob/master/LICENSE. Loaded by the browser app to open and render source PDFs.
- **pdf-lib 1.17.1** — MIT License: https://github.com/Hopding/pdf-lib/blob/master/LICENSE.md. Dynamically loaded during export to embed the transparent PNG annotation layer into the original PDF.

The first-party Luxraj annotation and PDF-engine modules do not import either library. These notices should only be removed after the app no longer loads or relies on the respective dependency.
