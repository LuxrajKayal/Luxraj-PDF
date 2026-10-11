import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PdfHexString,
  PdfName,
  PdfReference,
  PdfString,
  addAnnotationsToPdf,
  annotationsToPdfContent,
  createAnnotationPdf,
  createPdf,
  parsePdfDocument,
  parsePdfValue,
  pdfHexString,
  pdfName,
  pdfRef,
  pdfString,
  serializePdfValue,
} from '../luxraj-pdf-engine.js';

function binaryText(bytes) {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
}

test('serializes PDF names, references, strings, arrays, and dictionaries', () => {
  const value = {
    Type: pdfName('Page'),
    Contents: pdfRef(12, 0),
    Label: pdfString('A (safe) \\ label'),
    Flags: [true, false, null, 3.5],
  };
  assert.equal(
    serializePdfValue(value),
    '<< /Type /Page /Contents 12 0 R /Label (A \\(safe\\) \\\\ label) /Flags [true false null 3.5] >>',
  );
  assert.ok(pdfName('A B') instanceof PdfName);
  assert.ok(pdfRef(2) instanceof PdfReference);
  assert.ok(pdfString('Hello') instanceof PdfString);
  assert.ok(pdfHexString(new Uint8Array([0, 255])) instanceof PdfHexString);
});

test('PDF syntax parser reads names, escaped names, nested strings, arrays, and references', () => {
  const source = '  % comment\n<< /Type /Page /Escaped /A#20B /Nums [0 10.5 -2] /Ref 14 2 R /S (x\\(y\\)\\n) >> tail';
  const parsed = parsePdfValue(source);
  assert.deepEqual(parsed.value.Type, pdfName('Page'));
  assert.equal(parsed.value.Escaped.value, 'A B');
  assert.deepEqual(parsed.value.Nums, [0, 10.5, -2]);
  assert.equal(parsed.value.Ref.objectNumber, 14);
  assert.equal(parsed.value.Ref.generation, 2);
  assert.equal(binaryText(parsed.value.S.bytes), 'x(y)\n');
  assert.equal(source.slice(parsed.offset).trim(), 'tail');
});

test('parser decodes octal and hex strings and pads odd hex digits', () => {
  const octal = parsePdfValue('(A\\101\\n)').value;
  assert.equal(binaryText(octal.bytes), 'AA\n');
  const hex = parsePdfValue('<4142F>').value;
  assert.equal(binaryText(hex.bytes), 'AB\xF0');
});

test('malformed PDF values fail instead of silently accepting incomplete structures', () => {
  assert.throws(() => parsePdfValue('(not closed'), /Unterminated PDF literal string/);
  assert.throws(() => parsePdfValue('[1 2'), /Unterminated PDF array/);
  assert.throws(() => parsePdfValue('<< /Type'), /Expected a PDF value at end of input/);
  assert.throws(() => parsePdfValue('<Q0>'), /Invalid character/);
  assert.throws(() => parsePdfValue('/'), /Empty or malformed PDF name/);
});

test('creates a PDF with valid object offsets and a classic cross-reference table', () => {
  const bytes = createPdf({
    pages: [{ width: 200, height: 100, content: 'q 1 0 0 rg 10 10 30 20 re f Q' }],
  });
  const text = binaryText(bytes);
  assert.ok(text.startsWith('%PDF-1.4\n'));
  assert.ok(text.includes('/Type /Catalog'));
  assert.ok(text.includes('/Type /Page'));
  assert.ok(text.includes('10 10 30 20 re f'));
  const startMatch = text.match(/startxref\n(\d+)\n%%EOF/);
  assert.ok(startMatch);
  const xrefOffset = Number(startMatch[1]);
  assert.equal(text.slice(xrefOffset, xrefOffset + 4), 'xref');
  const xrefLine = text.slice(xrefOffset).split('\n')[3];
  const firstObjectOffset = Number(xrefLine.slice(0, 10));
  assert.equal(text.slice(firstObjectOffset, firstObjectOffset + 7), '1 0 obj');
});

test('creates a valid empty-page tree and supports byte content streams', () => {
  const empty = binaryText(createPdf());
  assert.ok(empty.includes('/Count 0'));
  const stream = new Uint8Array([65, 66, 67, 0, 255]);
  const text = binaryText(createPdf({ pages: [{ width: 612, height: 792, content: stream }] }));
  assert.ok(text.includes('/Length 5'));
  assert.ok(text.includes('stream\nABC\x00\xFF\nendstream'));
});

test('rejects invalid PDF writer input', () => {
  assert.throws(() => createPdf({ pages: 'no' }), /pages must be an array/);
  assert.throws(() => createPdf({ pages: [{ width: 0, height: 100 }] }), /Page width must be a positive/);
  assert.throws(() => serializePdfValue(Number.POSITIVE_INFINITY), /finite/);
});

test('converts first-party rectangle, line, and text annotations into PDF operators', () => {
  const annotations = [
    { id: 1, type: 'rect', pageIndex: 0, color: '#ff0000', thickness: 2, fill: false, points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] },
    { id: 2, type: 'line', pageIndex: 0, color: '#0000ff', thickness: 1, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] },
    { id: 3, type: 'text', pageIndex: 0, color: '#000000', thickness: 1, fontSize: 12, text: 'Hello PDF', points: [{ x: 5, y: 10 }] },
    { id: 4, type: 'rect', pageIndex: 1, color: '#000000', thickness: 1, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
  ];
  const content = annotationsToPdfContent(annotations, {
    pageIndex: 0, pageWidth: 200, pageHeight: 100, canvasWidth: 100, canvasHeight: 50,
  });
  assert.ok(content.includes('20 60 20 20 re\nS'));
  assert.ok(content.includes('0 100 m 20 80 l S'));
  assert.ok(content.includes('BT /F1 12 Tf 10 80 Td (Hello PDF) Tj ET'));
  assert.equal(content.split(' re\nS').length - 1, 1);
});

test('creates annotation-only PDF files with content and validates unsupported Unicode text', () => {
  const bytes = createAnnotationPdf({
    pages: [{ width: 200, height: 100, canvasWidth: 100, canvasHeight: 50 }],
    annotations: [{ type: 'arrow', pageIndex: 0, color: '#123456', thickness: 2, points: [{ x: 10, y: 10 }, { x: 50, y: 25 }] }],
  });
  const text = binaryText(bytes);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.includes(' RG'));
  assert.ok(text.includes(' l S'));
  assert.ok(text.includes('startxref'));
  assert.throws(() => annotationsToPdfContent(
    [{ type: 'text', pageIndex: 0, text: 'café', points: [{ x: 0, y: 0 }] }],
    { pageWidth: 200, pageHeight: 100 }
  ), /ASCII annotation text only/);
});

test('reads page boxes and directly sized content streams from a classic-xref PDF', () => {
  const sourceBytes = createPdf({
    pages: [
      { width: 200, height: 100, content: 'q 1 0 0 rg 10 10 30 20 re f Q' },
      { width: 612, height: 792, content: 'BT /F1 12 Tf 20 700 Td (Second) Tj ET' },
    ],
  });
  const document = parsePdfDocument(sourceBytes);
  assert.equal(document.version, '1.4');
  assert.equal(document.pages.length, 2);
  assert.deepEqual([document.pages[0].width, document.pages[0].height], [200, 100]);
  assert.deepEqual([document.pages[1].width, document.pages[1].height], [612, 792]);
  assert.equal(binaryText(document.pages[0].contentStreams[0]), 'q 1 0 0 rg 10 10 30 20 re f Q');
  assert.equal(binaryText(document.pages[1].contentStreams[0]), 'BT /F1 12 Tf 20 700 Td (Second) Tj ET');
  assert.equal(document.pages[0].object, 4);
});

test('rejects unsupported xref-stream PDFs and invalid document data clearly', () => {
  assert.throws(() => parsePdfDocument(new Uint8Array([1, 2, 3])), /recognizable PDF header/);
  const xrefStream = new TextEncoder().encode('%PDF-1.5\n1 0 obj << /Type /XRef >>\nstartxref\n10\n%%EOF');
  assert.throws(() => parsePdfDocument(xrefStream), /xref offset|xref stream/i);
});

test('appends annotations without changing the original PDF bytes or original page stream', () => {
  const original = createPdf({
    pages: [{ width: 200, height: 100, content: 'q 0.2 0.3 0.4 rg 5 5 40 30 re f Q' }],
  });
  const before = parsePdfDocument(original);
  const updatedBytes = addAnnotationsToPdf(original, [
    { id: 1, type: 'rect', pageIndex: 0, color: '#ff0000', thickness: 2, fill: false, points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] },
  ], { pageMetrics: [{ canvasWidth: 200, canvasHeight: 100 }] });

  assert.deepEqual(updatedBytes.slice(0, original.length), original);
  const after = parsePdfDocument(updatedBytes);
  assert.equal(after.pages.length, 1);
  assert.equal(after.pages[0].contentStreams.length, 2);
  assert.equal(binaryText(after.pages[0].contentStreams[0]), 'q 0.2 0.3 0.4 rg 5 5 40 30 re f Q');
  assert.ok(binaryText(after.pages[0].contentStreams[1]).includes('10 70 20 20 re'));
  assert.equal(after.trailer.Prev, before.startXref);
  assert.ok(after.startXref > before.startXref);
});

test('first-party incremental writer returns original bytes if no annotations are supplied', () => {
  const original = createPdf({ pages: [{ width: 100, height: 100, content: '' }] });
  assert.deepEqual(addAnnotationsToPdf(original, []), original);
});
