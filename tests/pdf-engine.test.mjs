import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PdfHexString,
  PdfName,
  PdfReference,
  PdfString,
  createPdf,
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
  const xrefLine = text.slice(xrefOffset).split('\n')[2];
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
