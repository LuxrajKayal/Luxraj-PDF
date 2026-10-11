import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { createPdf, parsePdfDocument, pdfName } from '../luxraj-pdf-engine.js';
import { renderPdfPage } from '../luxraj-pdf-renderer.js';


function createFlatePdf(content) {
  const encodedContent = deflateSync(Buffer.from(content, 'latin1'));
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'),
    Buffer.from('<< /Type /Pages /Kids [4 0 R] /Count 1 >>', 'latin1'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 'latin1'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>', 'latin1'),
    Buffer.concat([
      Buffer.from('<< /Length ' + encodedContent.length + ' /Filter /FlateDecode >>\nstream\n', 'latin1'),
      encodedContent,
      Buffer.from('\nendstream', 'latin1'),
    ]),
  ];
  const parts = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets = [0];
  let length = parts[0].length;
  objects.forEach((body, index) => {
    const head = Buffer.from((index + 1) + ' 0 obj\n', 'latin1');
    const tail = Buffer.from('\nendobj\n', 'latin1');
    offsets.push(length);
    parts.push(head, body, tail);
    length += head.length + body.length + tail.length;
  });
  const xrefOffset = length;
  let xref = 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  xref += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n';
  parts.push(Buffer.from(xref, 'latin1'));
  return new Uint8Array(Buffer.concat(parts));
}

class RecordingCanvasContext {
  constructor() {
    this.canvas = {
      width: 0,
      height: 0,
      ownerDocument: {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => ({
            createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4) }; },
            putImageData(imageData) { this.lastImageData = imageData; },
            drawImage() {},
          }),
        }),
      },
    };
    this.calls = [];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.font = '1px Arial';
  }
  record(name, ...args) { this.calls.push({ name, args }); }
  save(...args) { this.record('save', ...args); }
  restore(...args) { this.record('restore', ...args); }
  setTransform(...args) { this.record('setTransform', ...args); }
  transform(...args) { this.record('transform', ...args); }
  clearRect(...args) { this.record('clearRect', ...args); }
  fillRect(...args) { this.record('fillRect', ...args); }
  beginPath(...args) { this.record('beginPath', ...args); }
  moveTo(...args) { this.record('moveTo', ...args); }
  lineTo(...args) { this.record('lineTo', ...args); }
  bezierCurveTo(...args) { this.record('bezierCurveTo', ...args); }
  closePath(...args) { this.record('closePath', ...args); }
  rect(...args) { this.record('rect', ...args); }
  stroke(...args) {
    this.record('stroke', ...args);
    this.calls[this.calls.length - 1].alpha = this.globalAlpha ?? 1;
  }
  fill(...args) {
    this.record('fill', ...args);
    this.calls[this.calls.length - 1].alpha = this.globalAlpha ?? 1;
  }
  clip(...args) { this.record('clip', ...args); }
  fillText(...args) { this.record('fillText', ...args); }
  strokeText(...args) { this.record('strokeText', ...args); }
  setLineDash(...args) { this.record('setLineDash', ...args); }
  drawImage(...args) { this.record('drawImage', ...args); }
  createLinearGradient(...args) {
    this.record('createLinearGradient', ...args);
    const gradient = { kind: 'linear-gradient', stops: [], addColorStop(offset, color) { this.stops.push({ offset, color }); } };
    this.lastGradient = gradient;
    return gradient;
  }
  createRadialGradient(...args) {
    this.record('createRadialGradient', ...args);
    const gradient = { kind: 'radial-gradient', stops: [], addColorStop(offset, color) { this.stops.push({ offset, color }); } };
    this.lastGradient = gradient;
    return gradient;
  }
  measureText(text) { return { width: String(text).length * 0.5 }; }
}

test('renders PDF paths and colors into a canvas context', async () => {
  const source = createPdf({
    pages: [{
      width: 200,
      height: 100,
      content: 'q 1 0 0 rg 10 20 30 40 re f Q 0 0 1 RG 2 w 5 5 m 50 50 l S',
    }],
  });
  const document = parsePdfDocument(source);
  const context = new RecordingCanvasContext();

  const result = await renderPdfPage(context, document, 0, { scale: 2 });

  assert.deepEqual([result.width, result.height], [400, 200]);
  assert.equal(context.canvas.width, 400);
  assert.equal(context.canvas.height, 200);
  assert.ok(context.calls.some((call) => call.name === 'rect' && call.args.join(' ') === '10 20 30 40'));
  assert.ok(context.calls.some((call) => call.name === 'fill'));
  assert.ok(context.calls.some((call) => call.name === 'moveTo' && call.args.join(' ') === '5 5'));
  assert.ok(context.calls.some((call) => call.name === 'lineTo' && call.args.join(' ') === '50 50'));
  assert.ok(context.calls.some((call) => call.name === 'stroke'));
  assert.deepEqual(result.warnings, []);
});

test('renders simple text using the page font resource and text matrix', async () => {
  const source = createPdf({
    pages: [{
      width: 300,
      height: 200,
      content: 'BT /F1 12 Tf 1 0 0 1 40 80 Tm (Luxraj) Tj ET',
    }],
  });
  const document = parsePdfDocument(source);
  const context = new RecordingCanvasContext();

  const result = await renderPdfPage(context, document, 0);

  const text = context.calls.find((call) => call.name === 'fillText');
  assert.ok(text);
  assert.deepEqual(text.args, ['Luxraj', 0, 0]);
  const transform = context.calls.find((call) => call.name === 'setTransform' &&
    call.args.length === 6 && call.args[0] === 12 && call.args[3] === 12);
  assert.ok(transform, 'text should apply the PDF font size and upright glyph transform');
  assert.deepEqual(result.warnings, []);
});

test('handles an unmatched Q safely and reports unsupported image XObjects', async () => {
  const source = createPdf({
    pages: [{
      width: 100,
      height: 100,
      content: 'Q /Im0 Do 10 10 20 20 re S',
    }],
  });
  const document = parsePdfDocument(source);
  const context = new RecordingCanvasContext();

  const result = await renderPdfPage(context, document, 0);

  assert.ok(result.warnings.some((warning) => warning.includes('unmatched Q')));
  assert.ok(result.warnings.some((warning) => warning.includes('unresolved XObject /Im0')));
  assert.ok(context.calls.some((call) => call.name === 'rect'));
});

test('rejects invalid page indices and render scales', async () => {
  const source = createPdf({ pages: [{ width: 100, height: 100, content: '' }] });
  const document = parsePdfDocument(source);
  const context = new RecordingCanvasContext();

  await assert.rejects(() => renderPdfPage(context, document, 1), /outside the parsed document/);
  await assert.rejects(() => renderPdfPage(context, document, 0, { scale: 0 }), /positive finite number/);
});


test('decodes FlateDecode page content before drawing', async () => {
  const source = createFlatePdf('0 0 1 rg 10 15 20 25 re f');
  const document = parsePdfDocument(source);
  const context = new RecordingCanvasContext();

  const result = await renderPdfPage(context, document, 0);

  assert.ok(context.calls.some((call) => call.name === 'rect' && call.args.join(' ') === '10 15 20 25'));
  assert.ok(context.calls.some((call) => call.name === 'fill'));
  assert.deepEqual(result.warnings, []);
});


test('renders a Type 3 shading pattern without a compatibility warning', async () => {
  const resources = {
    Pattern: {
      P1: {
        Type: pdfName('Pattern'),
        PatternType: 2,
        Matrix: [1, 0, 0, 1, 0, 0],
        Shading: {
          ShadingType: 2,
          ColorSpace: pdfName('DeviceRGB'),
          Coords: [0, 0, 100, 0],
          Function: {
            FunctionType: 3,
            Domain: [0, 1],
            Bounds: [0.5],
            Encode: [0, 1, 0, 1],
            Functions: [
              { FunctionType: 2, Domain: [0, 1], C0: [1, 0, 0], C1: [0, 1, 0], N: 1 },
              { FunctionType: 2, Domain: [0, 1], C0: [0, 1, 0], C1: [0, 0, 1], N: 1 },
            ],
          },
        },
      },
    },
  };
  const source = createPdf({
    pages: [{ width: 100, height: 100, resources, content: 'q /Pattern cs /P1 scn 0 0 100 100 re f Q' }],
  });
  const document = parsePdfDocument(source);
  const context = new RecordingCanvasContext();

  const result = await renderPdfPage(context, document, 0);

  assert.equal(context.lastGradient.kind, 'linear-gradient');
  assert.ok(context.lastGradient.stops.length >= 12);
  assert.ok(context.calls.some((call) => call.name === 'rect'));
  assert.deepEqual(result.warnings, []);
});

function createClassicPdf(objectBodies) {
  const parts = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets = [0];
  let byteOffset = parts[0].length;
  objectBodies.forEach((body, index) => {
    const content = Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1');
    const header = Buffer.from((index + 1) + ' 0 obj\n', 'latin1');
    const footer = Buffer.from('\nendobj\n', 'latin1');
    offsets.push(byteOffset);
    parts.push(header, content, footer);
    byteOffset += header.length + content.length + footer.length;
  });
  const xrefOffset = byteOffset;
  let xref = 'xref\n0 ' + (objectBodies.length + 1) + '\n0000000000 65535 f \n';
  for (let index = 1; index < offsets.length; index += 1) {
    xref += String(offsets[index]).padStart(10, '0') + ' 00000 n \n';
  }
  xref += 'trailer\n<< /Size ' + (objectBodies.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF\n';
  parts.push(Buffer.from(xref, 'latin1'));
  return new Uint8Array(Buffer.concat(parts));
}

test('uses a Type0 font ToUnicode map when drawing text', async () => {
  const cmap = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /LuxrajTest def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
    '3 beginbfchar',
    '<0001> <0041>',
    '<0002> <0042>',
    '<0003> <20AC>',
    'endbfchar',
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n');
  const content = 'BT /F1 12 Tf 1 0 0 1 10 20 Tm <000100020003> Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [6 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type0 /BaseFont /AAAAAA+Helvetica /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 5 0 R >>',
    '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /AAAAAA+Helvetica /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 500 >>',
    Buffer.concat([
      Buffer.from('<< /Length ' + Buffer.byteLength(cmap, 'latin1') + ' >>\nstream\n', 'latin1'),
      Buffer.from(cmap, 'latin1'),
      Buffer.from('\nendstream', 'latin1'),
    ]),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /Font << /F1 3 0 R >> >> /Contents 7 0 R >>',
    Buffer.concat([
      Buffer.from('<< /Length ' + Buffer.byteLength(content, 'latin1') + ' >>\nstream\n', 'latin1'),
      Buffer.from(content, 'latin1'),
      Buffer.from('\nendstream', 'latin1'),
    ]),
  ];
  const document = parsePdfDocument(createClassicPdf(objects));
  const context = new RecordingCanvasContext();

  const result = await renderPdfPage(context, document, 0);

  assert.deepEqual(context.calls.find((call) => call.name === 'fillText').args, ['AB€', 0, 0]);
  assert.deepEqual(result.warnings, []);
});


test('applies ExtGState fill and stroke alpha independently', async () => {
  const source = createPdf({
    pages: [{
      width: 100,
      height: 100,
      resources: {
        ExtGState: {
          GS1: { Type: pdfName('ExtGState'), ca: 0.25, CA: 0.5, BM: pdfName('Normal') },
        },
      },
      content: 'q /GS1 gs 1 0 0 rg 10 10 20 20 re f 0 0 1 RG 2 w 0 0 m 30 30 l S Q',
    }],
  });
  const document = parsePdfDocument(source);
  const context = new RecordingCanvasContext();

  const result = await renderPdfPage(context, document, 0);

  assert.equal(context.calls.find((call) => call.name === 'fill').alpha, 0.25);
  assert.equal(context.calls.find((call) => call.name === 'stroke').alpha, 0.5);
  assert.deepEqual(result.warnings, []);
});

test('renders an ICCBased image XObject with an 8-bit soft mask', async () => {
  const content = 'q 20 0 0 20 10 10 cm /Im1 Do Q';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [6 0 R] /Count 1 >>',
    Buffer.concat([
      Buffer.from('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace [/ICCBased 5 0 R] /BitsPerComponent 8 /SMask 4 0 R /Length 3 >>\nstream\n', 'latin1'),
      Buffer.from([255, 0, 0]),
      Buffer.from('\nendstream', 'latin1'),
    ]),
    Buffer.concat([
      Buffer.from('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n', 'latin1'),
      Buffer.from([128]),
      Buffer.from('\nendstream', 'latin1'),
    ]),
    Buffer.from('<< /N 3 /Alternate /DeviceRGB /Length 0 >>\nstream\n\nendstream', 'latin1'),
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /XObject << /Im1 3 0 R >> >> /Contents 7 0 R >>',
    Buffer.concat([
      Buffer.from('<< /Length ' + Buffer.byteLength(content, 'latin1') + ' >>\nstream\n', 'latin1'),
      Buffer.from(content, 'latin1'),
      Buffer.from('\nendstream', 'latin1'),
    ]),
  ];
  const document = parsePdfDocument(createClassicPdf(objects));
  const context = new RecordingCanvasContext();

  const result = await renderPdfPage(context, document, 0);

  assert.ok(context.calls.some((call) => call.name === 'drawImage'));
  assert.deepEqual(result.warnings, []);
});
