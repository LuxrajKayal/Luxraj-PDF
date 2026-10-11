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
  assert.ok(content.includes('BT /F1 24 Tf 10 80 Td (Hello PDF) Tj ET'));
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

test('appends annotations while isolating their graphics state from the original page streams', () => {
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
  assert.equal(after.pages[0].contentStreams.length, 4);
  assert.equal(binaryText(after.pages[0].contentStreams[0]), 'q\n');
  assert.equal(binaryText(after.pages[0].contentStreams[1]), 'q 0.2 0.3 0.4 rg 5 5 40 30 re f Q');
  assert.equal(binaryText(after.pages[0].contentStreams[2]), 'Q\n');
  assert.ok(binaryText(after.pages[0].contentStreams[3]).includes('10 70 20 20 re'));
  assert.equal(after.trailer.Prev, before.startXref);
  assert.ok(after.startXref > before.startXref);
});

test('wraps unbalanced source-page transforms so exported marks use page coordinates', () => {
  // Chromium-generated PDFs can leave a page-wide CTM active outside a q/Q pair.
  const originalContent = '.24 0 0 -.24 0 100 cm\nq 1 0 0 rg 10 10 20 20 re f Q';
  const original = createPdf({
    pages: [{ width: 200, height: 100, content: originalContent }],
  });
  const updatedBytes = addAnnotationsToPdf(original, [
    { id: 2, type: 'line', pageIndex: 0, color: '#2563eb', thickness: 3, points: [{ x: 100, y: 25 }, { x: 150, y: 75 }] },
  ], { pageMetrics: [{ canvasWidth: 200, canvasHeight: 100 }] });

  const after = parsePdfDocument(updatedBytes);
  assert.equal(after.pages[0].contentStreams.length, 4);
  assert.equal(binaryText(after.pages[0].contentStreams[0]), 'q\n');
  assert.equal(binaryText(after.pages[0].contentStreams[1]), originalContent);
  assert.equal(binaryText(after.pages[0].contentStreams[2]), 'Q\n');
  assert.ok(binaryText(after.pages[0].contentStreams[3]).includes('100 75 m 150 25 l S'));
});

test('incremental export registers a dedicated Helvetica resource and converts text size and position', () => {
  const original = createPdf({
    pages: [{
      width: 200,
      height: 100,
      content: 'q 0.2 0.3 0.4 rg 5 5 40 30 re f Q',
      resources: { ProcSet: [pdfName('PDF')] },
    }],
  });
  const before = parsePdfDocument(original);
  const updatedBytes = addAnnotationsToPdf(original, [
    {
      id: 10,
      type: 'text',
      pageIndex: 0,
      color: '#000000',
      thickness: 1,
      fontSize: 10,
      text: 'Center',
      points: [{ x: 50, y: 25 }],
    },
  ], { pageMetrics: [{ canvasWidth: 100, canvasHeight: 50 }] });

  assert.deepEqual(updatedBytes.slice(0, original.length), original);
  const after = parsePdfDocument(updatedBytes);
  const page = after.pages[0];
  assert.deepEqual(page.resources.ProcSet, [pdfName('PDF')]);

  const fontReference = page.resources.Font.LuxrajText;
  assert.ok(fontReference instanceof PdfReference);
  const fontObject = after.objects.get(fontReference.objectNumber);
  assert.equal(fontObject.value.Type.value, 'Font');
  assert.equal(fontObject.value.Subtype.value, 'Type1');
  assert.equal(fontObject.value.BaseFont.value, 'Helvetica');
  assert.equal(fontObject.value.Encoding.value, 'WinAnsiEncoding');

  const originalContent = binaryText(page.contentStreams[1]);
  const annotationContent = binaryText(page.contentStreams[3]);
  assert.equal(binaryText(page.contentStreams[0]), 'q\n');
  assert.equal(originalContent, 'q 0.2 0.3 0.4 rg 5 5 40 30 re f Q');
  assert.equal(binaryText(page.contentStreams[2]), 'Q\n');
  assert.ok(annotationContent.includes('BT /LuxrajText 20 Tf 100 50 Td (Center) Tj ET'));
  assert.equal(before.pages.length, after.pages.length);
});

test('incremental export avoids overwriting a same-named font resource already in the PDF', () => {
  const original = createPdf({
    pages: [{
      width: 200,
      height: 100,
      content: 'BT /LuxrajText 12 Tf 10 80 Td (Original) Tj ET',
      resources: { Font: { LuxrajText: pdfRef(3) } },
    }],
  });
  const updatedBytes = addAnnotationsToPdf(original, [
    {
      id: 11,
      type: 'text',
      pageIndex: 0,
      color: '#000000',
      thickness: 1,
      fontSize: 10,
      text: 'Added',
      points: [{ x: 50, y: 25 }],
    },
  ], { pageMetrics: [{ canvasWidth: 100, canvasHeight: 50 }] });

  const after = parsePdfDocument(updatedBytes);
  const fonts = after.pages[0].resources.Font;
  assert.equal(fonts.LuxrajText.objectNumber, 3);
  assert.ok(fonts.LuxrajText1 instanceof PdfReference);
  const addedContent = binaryText(after.pages[0].contentStreams.at(-1));
  assert.ok(addedContent.includes('BT /LuxrajText1 20 Tf 100 50 Td (Added) Tj ET'));
});


test('encodes common Windows-1252 text in first-party text annotations', () => {
  const content = annotationsToPdfContent([
    {
      id: 20, type: 'text', pageIndex: 0, color: '#000000', thickness: 1,
      fontSize: 12, text: 'Café € —', points: [{ x: 10, y: 15 }],
    },
  ], { pageWidth: 100, pageHeight: 100 });
  assert.ok(content.includes(String.raw`(Caf\351 \200 \227)`));
  assert.throws(() => annotationsToPdfContent([
    { type: 'text', pageIndex: 0, text: 'こんにちは', points: [{ x: 0, y: 0 }] },
  ], { pageWidth: 100, pageHeight: 100 }), /Windows-1252 text only/);
});

test('incremental writer applies real opacity with ExtGState and preserves existing graphics states', () => {
  const original = createPdf({
    pages: [{
      width: 100, height: 100, content: '',
      resources: { ExtGState: { Existing: { Type: pdfName('ExtGState'), ca: 0.8, CA: 0.8 } } },
    }],
  });
  const updated = addAnnotationsToPdf(original, [
    { id: 21, type: 'highlight', pageIndex: 0, color: '#ff0000', opacity: 0.33, thickness: 4, points: [{ x: 10, y: 10 }, { x: 30, y: 30 }] },
    { id: 22, type: 'line', pageIndex: 0, color: '#0000ff', opacity: 0.5, thickness: 2, points: [{ x: 15, y: 20 }, { x: 35, y: 40 }] },
    { id: 23, type: 'text', pageIndex: 0, color: '#000000', opacity: 1, thickness: 1, fontSize: 12, text: 'Café € —', points: [{ x: 5, y: 12 }] },
  ], { pageMetrics: [{ canvasWidth: 100, canvasHeight: 100 }] });

  const document = parsePdfDocument(updated);
  const page = document.pages[0];
  const states = page.resources.ExtGState;
  assert.ok(states.Existing);
  const alpha33 = document.objects.get(states.LuxrajAlpha330.objectNumber).value;
  const alpha50 = document.objects.get(states.LuxrajAlpha500.objectNumber).value;
  assert.equal(alpha33.ca, 0.33);
  assert.equal(alpha33.CA, 0.33);
  assert.equal(alpha50.ca, 0.5);
  assert.equal(alpha50.CA, 0.5);
  const outputContent = binaryText(page.contentStreams.at(-1));
  assert.ok(outputContent.includes('/LuxrajAlpha330 gs'));
  assert.ok(outputContent.includes('/LuxrajAlpha500 gs'));
  assert.ok(outputContent.includes(String.raw`(Caf\351 \200 \227)`));
});

test('first-party incremental writer returns original bytes if no annotations are supplied', () => {
  const original = createPdf({ pages: [{ width: 100, height: 100, content: '' }] });
  assert.deepEqual(addAnnotationsToPdf(original, []), original);
});
