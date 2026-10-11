import test from 'node:test';
import assert from 'node:assert/strict';
import { createPdf, parsePdfDocument } from '../luxraj-pdf-engine.js';
import { renderPdfPage } from '../luxraj-pdf-renderer.js';

class RecordingCanvasContext {
  constructor() {
    this.canvas = { width: 0, height: 0 };
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
  stroke(...args) { this.record('stroke', ...args); }
  fill(...args) { this.record('fill', ...args); }
  clip(...args) { this.record('clip', ...args); }
  fillText(...args) { this.record('fillText', ...args); }
  strokeText(...args) { this.record('strokeText', ...args); }
  setLineDash(...args) { this.record('setLineDash', ...args); }
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
    call.args.length === 6 && call.args[0] === 12 && call.args[3] === -12);
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
  assert.ok(result.warnings.some((warning) => warning.includes('Image and Form XObjects')));
  assert.ok(context.calls.some((call) => call.name === 'rect'));
});

test('rejects invalid page indices and render scales', async () => {
  const source = createPdf({ pages: [{ width: 100, height: 100, content: '' }] });
  const document = parsePdfDocument(source);
  const context = new RecordingCanvasContext();

  await assert.rejects(() => renderPdfPage(context, document, 1), /outside the parsed document/);
  await assert.rejects(() => renderPdfPage(context, document, 0, { scale: 0 }), /positive finite number/);
});
