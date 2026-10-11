# Third-party dependency notices

Luxraj Editor now tries its first-party PDF reader and renderer first for the limited subset it supports. These external libraries remain runtime compatibility dependencies until the first-party replacements pass real-document tests. Their source code is not copied into this repository, and each library remains under its own license.

- **pdf-lib 1.17.1** — MIT License. Compatibility export for PDFs the Luxraj writer cannot safely handle: https://github.com/Hopding/pdf-lib/blob/master/LICENSE.md
- **PDF.js 5.7.284** — Apache License 2.0. Compatibility rendering for PDFs the Luxraj renderer cannot fully display: https://github.com/mozilla/pdf.js/blob/master/LICENSE

These dependency licenses apply to the respective libraries, not to Luxraj Editor's separately authored source code. An internet connection is required when a compatibility library is needed.
