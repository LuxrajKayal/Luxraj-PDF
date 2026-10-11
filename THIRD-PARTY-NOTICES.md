# Third-party dependency notices

The current Luxraj Editor runtime does not load PDF.js, pdf-lib, or another third-party JavaScript PDF library. PDF parsing, page rendering, annotation logic, and the supported incremental export path are implemented in the first-party files listed in the README. Structural FlateDecode decompression uses the browser/runtime's built-in Compression Streams API, not an imported JavaScript package.

This notice describes the current runtime as inspected; it does not claim that the first-party PDF engine implements every feature of the PDF specification. Add a separate notice and applicable licence details before introducing any third-party runtime dependency.
